<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * «Права 2.0», П2b-1 (docs/adr/0024-rights-2.md): компании. Всё, что уже есть, становится «Компанией 1»:
 * каждый пользователь — её «дом» (деактивированный — тоже, без отметки: деактивация по-прежнему у учётной записи,
 * решение PM 23.10), системный администратор — администратор компании (users.role: owner | member), у корневых
 * таблиц — company_id. Связи между компаниями запрещены в БД: составные FK (узлы дерева, выдачи, метки
 * пространства) и триггеры (роль выдачи, связи и блокировки карточек).
 *
 * Журнал событий не переписывается: company_id добавляется с DEFAULT («Компания 1» у старых строк без UPDATE —
 * триггер append-only не срабатывает), затем DEFAULT снимается; у новых событий без компании — NULL.
 *
 * Переход сверяет данные (членство каждого пользователя, число администраторов) и падает при расхождении — транзакция
 * откатывается. down() возвращает прежнюю модель или отказывает, если компаний больше одной (откат — из бэкапа).
 */
return new class extends Migration
{
    public const FIRST_COMPANY = 'Компания 1';

    /** Таблицы, у которых компания своя (у досок, карточек и прочего — через пространство). */
    private const TABLES = ['spaces', 'nav_nodes', 'groups', 'labels', 'card_types', 'invitations', 'access_grants'];

    public function up(): void
    {
        $this->createCompanies();
        $companyId = $this->createFirstCompany();
        $this->moveUsers($companyId);
        $this->addCompanyColumns($companyId);
        $this->addEventLogCompany($companyId);
        $this->addConstraints();
        $this->addCrossCompanyTriggers();
    }

    public function down(): void
    {
        $companies = (int) DB::table('companies')->count();
        if ($companies > 1) {
            throw new RuntimeException(
                "Откат компаний («Права 2.0», П2b-1) невозможен без потери данных — компаний: {$companies}. Прежняя модель "
                .'(одна организация) их не выражает. Откат — только из бэкапа (make restore / make pm-restore).'
            );
        }

        DB::unprepared(<<<'SQL'
            DROP TRIGGER IF EXISTS card_relations_same_company ON card_relations;
            DROP TRIGGER IF EXISTS card_blocks_same_company ON card_blocks;
            DROP FUNCTION IF EXISTS card_links_same_company();
            DROP TRIGGER IF EXISTS access_grants_role_company ON access_grants;
            DROP FUNCTION IF EXISTS access_grants_role_company();

            ALTER TABLE access_grants DROP CONSTRAINT access_grants_node_company_foreign;
            ALTER TABLE access_grants DROP CONSTRAINT access_grants_group_company_foreign;
            ALTER TABLE labels DROP CONSTRAINT labels_space_company_foreign;
            ALTER TABLE nav_nodes DROP CONSTRAINT nav_nodes_parent_company_foreign;
            ALTER TABLE nav_nodes DROP CONSTRAINT nav_nodes_space_company_foreign;
            ALTER TABLE nav_nodes DROP CONSTRAINT nav_nodes_id_company_unique;
            ALTER TABLE groups DROP CONSTRAINT groups_id_company_unique;
            ALTER TABLE spaces DROP CONSTRAINT spaces_id_company_unique;

            DROP INDEX groups_company_name_unique;
            DROP INDEX groups_company_system_key_unique;
            DROP INDEX labels_active_name_unique;
            DROP INDEX card_types_company_name_unique;
            DROP INDEX card_types_single_default;
            SQL);

        // Колонку журнала удаляет DDL, строки не переписываются (триггер append-only — на UPDATE/DELETE/TRUNCATE)
        DB::statement('ALTER TABLE event_log DROP COLUMN company_id');
        DB::statement('ALTER TABLE roles DROP CONSTRAINT roles_company_check');
        Schema::table('roles', fn (Blueprint $table) => $table->dropConstrainedForeignId('company_id'));
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropConstrainedForeignId('company_id'));
        }

        // Индексы и ограничения — как их создали миграции этапов 1–3
        DB::unprepared(<<<'SQL'
            CREATE UNIQUE INDEX groups_name_unique ON groups (lower(name));
            ALTER TABLE groups ADD CONSTRAINT groups_system_key_unique UNIQUE (system_key);
            CREATE UNIQUE INDEX labels_active_name_unique ON labels (COALESCE(space_id, ''), lower(name)) WHERE archived_at IS NULL;
            ALTER TABLE card_types ADD CONSTRAINT card_types_name_unique UNIQUE (name);
            CREATE UNIQUE INDEX card_types_single_default ON card_types (is_default) WHERE is_default;
            SQL);

        DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_check');
        DB::table('users')
            ->whereIn('id', DB::table('company_members')->select('user_id')->where('is_admin', true))
            ->where('role', 'member')
            ->update(['role' => 'admin']);
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'member'))");

        Schema::drop('company_members');
        Schema::drop('companies');
    }

    private function createCompanies(): void
    {
        // Компании не удаляются и не архивируются (решение PM 23.10, В10); создаёт и переименовывает только Владелец
        Schema::create('companies', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 100);
            $table->foreignUlid('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampsTz();
        });
        DB::statement('CREATE UNIQUE INDEX companies_name_unique ON companies (lower(name))');

        // Членство: «дом» — полноправный сотрудник компании (домов у человека может быть несколько); администратор
        // компании — только у «дома», назначает Владелец. Гости, срок и «убран из компании» — П2c.
        Schema::create('company_members', function (Blueprint $table) {
            $table->foreignUlid('company_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            $table->string('kind', 10)->default('home');
            $table->boolean('is_admin')->default(false);
            $table->timestampsTz();

            $table->primary(['company_id', 'user_id']);
            $table->index('user_id');
        });
        DB::statement("ALTER TABLE company_members ADD CONSTRAINT company_members_kind_check CHECK (kind IN ('home'))");
    }

    private function createFirstCompany(): string
    {
        $id = strtolower((string) Str::ulid());
        DB::table('companies')->insert([
            'id' => $id,
            'name' => self::FIRST_COMPANY,
            'created_by' => DB::table('users')->where('role', 'owner')->value('id'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    /** Каждый пользователь — «дом» в «Компании 1»; системный администратор → администратор компании. */
    private function moveUsers(string $companyId): void
    {
        $users = (int) DB::table('users')->count();
        $admins = (int) DB::table('users')->where('role', 'admin')->count();

        DB::statement(<<<'SQL'
            INSERT INTO company_members (company_id, user_id, kind, is_admin, created_at, updated_at)
            SELECT ?, id, 'home', role = 'admin', created_at, now() FROM users
            SQL, [$companyId]);

        DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_check');
        DB::table('users')->where('role', 'admin')->update(['role' => 'member']);
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'member'))");

        $members = (int) DB::table('company_members')->count();
        $companyAdmins = (int) DB::table('company_members')->where('is_admin', true)->count();
        if ($members !== $users || $companyAdmins !== $admins) {
            throw new RuntimeException(
                "Переход пользователей в «Компанию 1» не сошёлся: пользователей — {$users}, членств — {$members}, "
                ."администраторов было {$admins}, стало {$companyAdmins}. Ничего не изменено (транзакция откатывается)."
            );
        }
    }

    /** company_id у корневых таблиц: всё существующее — «Компания 1»; после заполнения — NOT NULL. */
    private function addCompanyColumns(string $companyId): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->foreignUlid('company_id')->nullable()->constrained()->restrictOnDelete());
            DB::table($name)->update(['company_id' => $companyId]);
            DB::statement("ALTER TABLE {$name} ALTER COLUMN company_id SET NOT NULL");
            Schema::table($name, fn (Blueprint $table) => $table->index('company_id'));
        }

        // Стандартные роли — общие (company_id пуст); пользовательская роль — справочник своей компании (П2e)
        Schema::table('roles', fn (Blueprint $table) => $table->foreignUlid('company_id')->nullable()->index()->constrained()->restrictOnDelete());
        DB::table('roles')->whereNull('key')->update(['company_id' => $companyId]);
        DB::statement('ALTER TABLE roles ADD CONSTRAINT roles_company_check CHECK ((key IS NULL) = (company_id IS NOT NULL))');
    }

    /** Без UPDATE строк журнала: DEFAULT заполняет старые строки на уровне каталога, затем снимается. */
    private function addEventLogCompany(string $companyId): void
    {
        $default = DB::getPdo()->quote($companyId);
        DB::statement("ALTER TABLE event_log ADD COLUMN company_id char(26) DEFAULT {$default} REFERENCES companies (id) ON DELETE RESTRICT");
        DB::statement('ALTER TABLE event_log ALTER COLUMN company_id DROP DEFAULT');
        DB::statement('CREATE INDEX event_log_company_id_index ON event_log (company_id, id)');
    }

    private function addConstraints(): void
    {
        DB::unprepared(<<<'SQL'
            -- Цели составных FK: объект и его компания
            ALTER TABLE spaces ADD CONSTRAINT spaces_id_company_unique UNIQUE (id, company_id);
            ALTER TABLE nav_nodes ADD CONSTRAINT nav_nodes_id_company_unique UNIQUE (id, company_id);
            ALTER TABLE groups ADD CONSTRAINT groups_id_company_unique UNIQUE (id, company_id);

            -- Дерево у каждой компании своё: родитель и пространство узла — той же компании
            ALTER TABLE nav_nodes
                ADD CONSTRAINT nav_nodes_parent_company_foreign FOREIGN KEY (parent_id, company_id)
                    REFERENCES nav_nodes (id, company_id) ON DELETE RESTRICT,
                ADD CONSTRAINT nav_nodes_space_company_foreign FOREIGN KEY (space_id, company_id)
                    REFERENCES spaces (id, company_id) ON DELETE RESTRICT;

            -- Выдача доступа — на узел и группе своей компании
            ALTER TABLE access_grants
                ADD CONSTRAINT access_grants_node_company_foreign FOREIGN KEY (nav_node_id, company_id)
                    REFERENCES nav_nodes (id, company_id) ON DELETE RESTRICT,
                ADD CONSTRAINT access_grants_group_company_foreign FOREIGN KEY (group_id, company_id)
                    REFERENCES groups (id, company_id) ON DELETE RESTRICT;

            -- Метка пространства — той же компании, что пространство
            ALTER TABLE labels
                ADD CONSTRAINT labels_space_company_foreign FOREIGN KEY (space_id, company_id)
                    REFERENCES spaces (id, company_id) ON DELETE RESTRICT;

            -- Названия и встроенные группы — в пределах компании (у каждой своя «Все сотрудники»)
            DROP INDEX groups_name_unique;
            CREATE UNIQUE INDEX groups_company_name_unique ON groups (company_id, lower(name));
            ALTER TABLE groups DROP CONSTRAINT groups_system_key_unique;
            CREATE UNIQUE INDEX groups_company_system_key_unique ON groups (company_id, system_key);

            DROP INDEX labels_active_name_unique;
            CREATE UNIQUE INDEX labels_active_name_unique
                ON labels (company_id, COALESCE(space_id, ''), lower(name)) WHERE archived_at IS NULL;

            ALTER TABLE card_types DROP CONSTRAINT card_types_name_unique;
            CREATE UNIQUE INDEX card_types_company_name_unique ON card_types (company_id, name);
            DROP INDEX card_types_single_default;
            CREATE UNIQUE INDEX card_types_single_default ON card_types (company_id) WHERE is_default;
            SQL);
    }

    /**
     * Страховка к проверкам приложения (RelatedCardGuard, правила «в этой компании»): связать карточки разных компаний
     * и выдать роль другой компании нельзя. Append-only триггеры card_blocks не меняются — добавляется проверка
     * на вставку. Функции — с фиксированным search_path (как триггеры ролей, П2a).
     */
    private function addCrossCompanyTriggers(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION card_links_same_company() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
            DECLARE
                first_card text;
                second_card text;
            BEGIN
                IF TG_TABLE_NAME = 'card_relations' THEN
                    first_card := NEW.parent_id;
                    second_card := NEW.child_id;
                ELSE
                    first_card := NEW.card_id;
                    second_card := NEW.blocking_card_id;
                END IF;

                IF second_card IS NOT NULL AND (
                    SELECT count(DISTINCT s.company_id)
                      FROM public.cards c JOIN public.spaces s ON s.id = c.space_id
                     WHERE c.id IN (first_card, second_card)
                ) <> 1 THEN
                    RAISE EXCEPTION '%: cards of different companies cannot be linked', TG_TABLE_NAME
                        USING ERRCODE = 'check_violation';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER card_relations_same_company BEFORE INSERT OR UPDATE ON card_relations
                FOR EACH ROW EXECUTE FUNCTION card_links_same_company();
            CREATE TRIGGER card_blocks_same_company BEFORE INSERT ON card_blocks
                FOR EACH ROW EXECUTE FUNCTION card_links_same_company();

            CREATE OR REPLACE FUNCTION access_grants_role_company() RETURNS trigger
            LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM public.roles WHERE id = NEW.role_id AND company_id IS DISTINCT FROM NEW.company_id AND key IS NULL
                ) THEN
                    RAISE EXCEPTION 'access_grants: a role of another company cannot be granted'
                        USING ERRCODE = 'foreign_key_violation';
                END IF;

                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER access_grants_role_company BEFORE INSERT OR UPDATE OF role_id, company_id ON access_grants
                FOR EACH ROW EXECUTE FUNCTION access_grants_role_company();
            SQL);
    }
};
