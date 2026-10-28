<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * «Права 2.0», П2c-1 (docs/adr/0024-rights-2.md): гости, деактивация в компании, блокировка учётной записи Владельцем,
 * права компании лично и группам.
 *
 * - company_members: вид guest (гость — только личные выдачи на пространства, срок expires_at — по желанию) и отметка
 *   deactivated_at — человек убран из компании («Деактивировать» в её админке). Администратор компании — только «дом»;
 *   гостя не деактивируют, а убирают (строка удаляется); «дом» не становится гостем.
 * - users.blocked_at — учётную запись отключил Владелец (снимает только он, решение PM 28.10). users.status остаётся
 *   единственным замком входа: deactivated — если учётная запись отключена или у человека не осталось действующего
 *   «дома» (CHECK: отключённый всегда deactivated).
 * - company_permission_grants — права компании человеку («дому» компании) или группе компании.
 *
 * Переход: у нынешних деактивированных (до П2c деактивация была у учётной записи) все «дома» получают отметку
 * deactivated_at — так деактивацию видит новая модель, для людей ничего не меняется. Миграция сверяет: у каждого
 * деактивированного нет действующего «дома», у каждого активного и приглашённого (кроме Владельца) — есть.
 *
 * down() возвращает прежнюю модель или отказывает, если в ней невыразимы данные (гости, права компании, отключённые
 * Владельцем, человек деактивирован в одной компании и работает в другой) — тогда откат только из бэкапа.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->extendMemberships();
        $this->addAccountBlock();
        $this->moveDeactivations();
        $this->createCompanyPermissionGrants();
        $this->addGuards();
    }

    public function down(): void
    {
        $blockers = [
            'гости' => DB::table('company_members')->where('kind', 'guest')->count(),
            'права компании' => DB::table('company_permission_grants')->count(),
            'отключённые Владельцем' => DB::table('users')->whereNotNull('blocked_at')->count(),
            'деактивированы в одной компании, работают в другой' => DB::table('company_members')
                ->join('users', 'users.id', '=', 'company_members.user_id')
                ->whereNotNull('company_members.deactivated_at')
                ->where('users.status', '!=', 'deactivated')
                ->count(),
        ];
        $found = array_filter($blockers);
        if ($found !== []) {
            $list = implode(', ', array_map(fn (string $what, int $count) => "{$what}: {$count}", array_keys($found), $found));
            throw new RuntimeException(
                "Откат «Прав 2.0» П2c-1 невозможен без потери данных — {$list}. Прежняя модель их не выражает. "
                .'Откат — только из бэкапа (make restore / make pm-restore).'
            );
        }

        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS company_members_guest_grants_check ON company_members;
            DROP FUNCTION IF EXISTS company_members_guest_grants_check();
            DROP TRIGGER IF EXISTS company_members_kind_guard ON company_members;
            DROP FUNCTION IF EXISTS company_members_kind_guard();
            DROP TRIGGER IF EXISTS access_grants_guest_check ON access_grants;
            DROP FUNCTION IF EXISTS access_grants_guest_check();
            DROP TRIGGER IF EXISTS company_permission_grants_user_company ON company_permission_grants;
            SQL);
        $this->restoreLinksCheck();
        Schema::drop('company_permission_grants');

        DB::statement('ALTER TABLE users DROP CONSTRAINT users_blocked_check');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('blocked_at'));

        DB::statement('ALTER TABLE company_members DROP CONSTRAINT company_members_admin_check');
        DB::statement('ALTER TABLE company_members DROP CONSTRAINT company_members_deactivated_check');
        DB::statement('ALTER TABLE company_members DROP CONSTRAINT company_members_expires_check');
        DB::statement('ALTER TABLE company_members DROP CONSTRAINT company_members_kind_check');
        DB::statement("ALTER TABLE company_members ADD CONSTRAINT company_members_kind_check CHECK (kind IN ('home'))");
        // Деактивация снова только у учётной записи (users.status — не менялся)
        Schema::table('company_members', fn (Blueprint $table) => $table->dropColumn(['expires_at', 'deactivated_at']));
    }

    private function extendMemberships(): void
    {
        Schema::table('company_members', function (Blueprint $table) {
            $table->timestampTz('expires_at')->nullable();
            $table->timestampTz('deactivated_at')->nullable();
        });

        DB::unprepared(<<<'SQL'
            ALTER TABLE company_members DROP CONSTRAINT company_members_kind_check;
            ALTER TABLE company_members ADD CONSTRAINT company_members_kind_check CHECK (kind IN ('home', 'guest'));
            -- Срок — только у гостя; гостя не деактивируют, а убирают
            ALTER TABLE company_members ADD CONSTRAINT company_members_deactivated_check
                CHECK (kind = 'home' OR deactivated_at IS NULL);
            ALTER TABLE company_members ADD CONSTRAINT company_members_expires_check
                CHECK (kind = 'guest' OR expires_at IS NULL);
            ALTER TABLE company_members ADD CONSTRAINT company_members_admin_check
                CHECK (kind = 'home' OR NOT is_admin);
            SQL);
    }

    private function addAccountBlock(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->timestampTz('blocked_at')->nullable());
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_blocked_check CHECK (blocked_at IS NULL OR status = 'deactivated')");
    }

    private function moveDeactivations(): void
    {
        DB::statement(<<<'SQL'
            UPDATE company_members m
               SET deactivated_at = coalesce(u.deactivated_at, now()), updated_at = now()
              FROM users u
             WHERE u.id = m.user_id AND u.status = 'deactivated' AND m.kind = 'home'
            SQL);

        $activeHome = fn ($q) => $q->from('company_members')
            ->whereColumn('company_members.user_id', 'users.id')
            ->where('company_members.kind', 'home')
            ->whereNull('company_members.deactivated_at')
            ->selectRaw('1');
        $deactivatedWithHome = DB::table('users')->where('status', 'deactivated')->whereExists($activeHome)->count();
        $workingWithoutHome = DB::table('users')
            ->where('status', '!=', 'deactivated')
            ->where('role', '!=', 'owner')
            ->whereNotExists($activeHome)
            ->count();
        if ($deactivatedWithHome > 0 || $workingWithoutHome > 0) {
            throw new RuntimeException(
                "Переход деактивации в компании не сошёлся: деактивированных с действующим «домом» — {$deactivatedWithHome}, "
                ."активных или приглашённых без «дома» — {$workingWithoutHome}."
            );
        }
    }

    private function createCompanyPermissionGrants(): void
    {
        // Права компании (Permission::scope() === 'company'): человеку — «дому» компании, или группе компании
        Schema::create('company_permission_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->nullable()->constrained()->restrictOnDelete();
            $table->ulid('group_id')->nullable();
            $table->string('permission', 100);
            $table->foreignUlid('granted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampsTz();

            $table->index('user_id');
            $table->index('group_id');
        });

        DB::unprepared(<<<'SQL'
            ALTER TABLE company_permission_grants
                ADD CONSTRAINT company_permission_grants_one_subject CHECK ((user_id IS NULL) <> (group_id IS NULL)),
                ADD CONSTRAINT company_permission_grants_company_scope CHECK (permission LIKE 'company.%'),
                -- Группа — той же компании (составной FK, как у выдач доступа)
                ADD CONSTRAINT company_permission_grants_group_company_foreign FOREIGN KEY (group_id, company_id)
                    REFERENCES groups (id, company_id) ON DELETE RESTRICT;
            CREATE UNIQUE INDEX company_permission_grants_user_unique
                ON company_permission_grants (company_id, user_id, permission) WHERE user_id IS NOT NULL;
            CREATE UNIQUE INDEX company_permission_grants_group_unique
                ON company_permission_grants (group_id, permission) WHERE group_id IS NOT NULL;
            SQL);
    }

    private function addGuards(): void
    {
        DB::unprepared(<<<'SQL'
            -- Гость — только личные выдачи на пространства и роли без «управления доступом» (ADR-0024). Проверка при
            -- выдаче и смене роли; пользовательские роли (П2e) проверяют изменение прав роли, выданной гостю, сами
            CREATE OR REPLACE FUNCTION access_grants_guest_check() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
            BEGIN
                IF NEW.user_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.company_members
                     WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND kind = 'guest'
                ) AND (
                    NOT EXISTS (SELECT 1 FROM public.nav_nodes WHERE id = NEW.nav_node_id AND space_id IS NOT NULL)
                    OR EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = NEW.role_id AND permission = 'space.manage_access')
                ) THEN
                    RAISE EXCEPTION 'access_grants: a guest gets only spaces and roles without access management'
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER access_grants_guest_check BEFORE INSERT OR UPDATE OF user_id, role_id, nav_node_id, company_id ON access_grants
                FOR EACH ROW EXECUTE FUNCTION access_grants_guest_check();

            -- «Дом» не становится гостем: у гостя нет групп, прав компании и администрирования
            CREATE OR REPLACE FUNCTION company_members_kind_guard() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
            BEGIN
                IF OLD.kind = 'home' AND NEW.kind = 'guest' THEN
                    RAISE EXCEPTION 'company_members: an employee cannot become a guest'
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER company_members_kind_guard BEFORE UPDATE OF kind ON company_members
                FOR EACH ROW EXECUTE FUNCTION company_members_kind_guard();

            -- Человек становится гостем — у него в компании уже не должно быть выдач, которых гостю нельзя (с другой
            -- стороны того же правила, что access_grants_guest_check: гость появляется после выдачи — Владелец без «дома»)
            CREATE OR REPLACE FUNCTION company_members_guest_grants_check() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
            BEGIN
                IF NEW.kind = 'guest' AND EXISTS (
                    SELECT 1 FROM public.access_grants g
                      LEFT JOIN public.nav_nodes n ON n.id = g.nav_node_id
                     WHERE g.company_id = NEW.company_id AND g.user_id = NEW.user_id
                       AND (n.space_id IS NULL OR EXISTS (
                           SELECT 1 FROM public.role_permissions p WHERE p.role_id = g.role_id AND p.permission = 'space.manage_access'))
                ) THEN
                    RAISE EXCEPTION 'company_members: a guest gets only spaces and roles without access management'
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER company_members_guest_grants_check BEFORE INSERT OR UPDATE OF kind ON company_members
                FOR EACH ROW EXECUTE FUNCTION company_members_guest_grants_check();
            SQL);

        $this->replaceLinksCheck(withPermissionGrants: true);
        DB::statement('CREATE TRIGGER company_permission_grants_user_company BEFORE INSERT OR UPDATE OF user_id, company_id ON company_permission_grants
            FOR EACH ROW EXECUTE FUNCTION company_links_check()');
    }

    private function restoreLinksCheck(): void
    {
        $this->replaceLinksCheck(withPermissionGrants: false);
    }

    /**
     * company_links_check (П2b-1) — ещё и права компании: человеку — только «дому» компании (не гостю, не Владельцу без
     * «дома»: у Владельца все права компании и так). Остальные ветки — как в П2b-1.
     */
    private function replaceLinksCheck(bool $withPermissionGrants): void
    {
        $permissionGrants = $withPermissionGrants ? <<<'SQL'
                ELSIF TG_TABLE_NAME = 'company_permission_grants' THEN
                    ok := NEW.user_id IS NULL OR EXISTS (
                        SELECT 1 FROM public.company_members
                         WHERE company_id = NEW.company_id AND user_id = NEW.user_id AND kind = 'home'
                    );
            SQL : '';

        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION company_links_check() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS \$\$
            DECLARE
                ok boolean;
            BEGIN
                IF TG_TABLE_NAME = 'group_members' THEN
                    ok := EXISTS (
                        SELECT 1 FROM public.groups g JOIN public.company_members m ON m.company_id = g.company_id
                         WHERE g.id = NEW.group_id AND m.user_id = NEW.user_id AND m.kind = 'home'
                    );
                ELSIF TG_TABLE_NAME = 'access_grants' THEN
                    ok := NEW.user_id IS NULL
                        OR EXISTS (SELECT 1 FROM public.company_members WHERE company_id = NEW.company_id AND user_id = NEW.user_id)
                        OR EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND role = 'owner');
            {$permissionGrants}
                ELSIF TG_TABLE_NAME = 'card_labels' THEN
                    ok := EXISTS (
                        SELECT 1 FROM public.cards c JOIN public.spaces s ON s.id = c.space_id
                          JOIN public.labels l ON l.company_id = s.company_id
                         WHERE c.id = NEW.card_id AND l.id = NEW.label_id
                    );
                ELSE
                    ok := EXISTS (
                        SELECT 1 FROM public.spaces s JOIN public.card_types t ON t.company_id = s.company_id
                         WHERE s.id = NEW.space_id AND t.id = NEW.card_type_id
                    );
                END IF;

                IF NOT ok THEN
                    RAISE EXCEPTION '%: a link to another company is not allowed', TG_TABLE_NAME
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                RETURN NEW;
            END;
            \$\$;
            SQL);
    }
};
