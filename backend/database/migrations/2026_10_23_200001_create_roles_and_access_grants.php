<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * «Права 2.0», П2a (docs/adr/0024-rights-2.md): каталог прав и стандартные роли, выдачи доступа вместо
 * space_members и space_groups. Поведение не меняется: роль + «только свои карточки» становится стандартной ролью,
 * каждая строка участия и доступа группы — выдачей на узел пространства в дереве (nav_nodes).
 *
 * Переход сверяет данные: число строк и содержимое (пространство, субъект, роль, флаг, дата) до и после совпадают,
 * иначе исключение и транзакция откатывается. down() восстанавливает прежние таблицы из выдач, а если в выдачах есть
 * то, чего прежняя модель выразить не может (выдача на папку, нестандартная роль, несколько ролей у одного субъекта), —
 * отказывает с объяснением (откат тогда — только из бэкапа).
 *
 * Стандартные роли и их права зафиксированы здесь, а не взяты из App\Enums\StandardRole: миграция не должна меняться
 * вместе с кодом. Совпадение с эталоном в коде проверяет StandardRolesTest.
 */
return new class extends Migration
{
    /** Права «Комментатора»: чтение входит в любую роль. */
    private const COMMENTER = ['folder.read', 'space.read', 'board.read', 'card.comment', 'field.read'];

    private const EDITOR = [...self::COMMENTER, 'card.create', 'card.update', 'card.move', 'card.invite', 'field.update'];

    /** Без прав на папки, перемещения, архива и удаления пространства и корзины — они с П2d (решение PM 23.10). */
    private const ADMIN = [
        ...self::EDITOR,
        'space.update', 'space.manage_access', 'space.view_settings',
        'board.create', 'board.update', 'board.delete',
        'field.delete', 'time.view_others', 'time.edit_others', 'automation.view', 'automation.manage',
    ];

    /** key => [название, область карточек, права]; порядок — порядок в списках ролей. */
    private const ROLES = [
        'admin' => ['Администратор', 'all', self::ADMIN],
        'editor' => ['Редактор', 'all', self::EDITOR],
        'commenter' => ['Комментатор', 'all', self::COMMENTER],
        'editor_own' => ['Редактор — только свои карточки', 'own', self::EDITOR],
        'commenter_own' => ['Комментатор — только свои карточки', 'own', self::COMMENTER],
    ];

    /** Права, с которыми роль не может быть ограничена своими карточками (как прежний CHECK «admin без ограничения»). */
    private const MANAGE_ACCESS = "('space.manage_access', 'folder.manage_access')";

    /** Роль API пространств (role + own_cards_only) → ключ стандартной роли. */
    private const LEGACY_TO_KEY = <<<'SQL'
        CASE WHEN %1$s.role = 'admin' THEN 'admin'
             WHEN %1$s.own_cards_only THEN %1$s.role || '_own'
             ELSE %1$s.role END
        SQL;

    public function up(): void
    {
        $this->createCatalog();
        $this->createAccessGrants();
        $this->moveLegacyAccess();
    }

    public function down(): void
    {
        $this->ensureExpressibleInLegacyModel();
        $this->createLegacyTables();

        foreach (['user' => 'space_members', 'group' => 'space_groups'] as $subject => $table) {
            DB::statement(<<<SQL
                INSERT INTO {$table} (space_id, {$subject}_id, role, own_cards_only, created_at, updated_at)
                SELECT n.space_id, g.{$subject}_id, regexp_replace(r.key, '_own$', ''), r.card_scope = 'own', g.created_at, g.updated_at
                  FROM access_grants g
                  JOIN nav_nodes n ON n.id = g.nav_node_id
                  JOIN roles r ON r.id = g.role_id
                 WHERE g.{$subject}_id IS NOT NULL
                SQL);
        }
        $this->ensureSameAccess();

        Schema::drop('access_grants');
        Schema::drop('role_permissions');
        Schema::drop('roles');
        DB::unprepared(<<<'SQL'
            DROP FUNCTION IF EXISTS role_permissions_scope_check();
            DROP FUNCTION IF EXISTS roles_scope_check();
            SQL);
    }

    private function createCatalog(): void
    {
        // Роль — набор прав и область карточек. Стандартные (key не пуст) ведут миграции; пользовательские роли
        // компаний (key пуст, company_id) — с П2b-1 и П2e.
        Schema::create('roles', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('key', 30)->nullable()->unique();
            $table->string('name', 100);
            $table->string('card_scope', 10);
            // «При изменении структуры прав выдавать новые права по умолчанию» (пользовательские роли, П2e)
            $table->boolean('grants_new_permissions')->default(false);
            // Дробные ключи порядка (ADR-0007)
            $table->string('position', 255)->collation('C');
            $table->timestampsTz();
        });
        DB::statement("ALTER TABLE roles ADD CONSTRAINT roles_card_scope_check CHECK (card_scope IN ('all', 'own'))");

        // Права роли — значения App\Enums\Permission (StandardRolesTest сверяет их с каталогом)
        Schema::create('role_permissions', function (Blueprint $table) {
            $table->foreignUlid('role_id')->constrained()->restrictOnDelete();
            $table->string('permission', 60);

            $table->primary(['role_id', 'permission']);
        });

        // Управлять доступом может только роль с областью «все карточки» — страховка в БД, как прежние CHECK
        // space_members_admin_not_restricted и space_groups_admin_not_restricted (ADR-0008).
        // OR REPLACE: migrate:fresh удаляет таблицы, но не функции
        $manageAccess = self::MANAGE_ACCESS;
        DB::unprepared(<<<SQL
            CREATE OR REPLACE FUNCTION role_permissions_scope_check() RETURNS trigger
            LANGUAGE plpgsql AS \$\$
            BEGIN
                IF NEW.permission IN {$manageAccess}
                   AND EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND card_scope = 'own') THEN
                    RAISE EXCEPTION 'roles: a role limited to own cards cannot manage access'
                        USING ERRCODE = 'check_violation';
                END IF;
                RETURN NEW;
            END;
            \$\$;

            CREATE OR REPLACE FUNCTION roles_scope_check() RETURNS trigger
            LANGUAGE plpgsql AS \$\$
            BEGIN
                IF NEW.card_scope = 'own' AND EXISTS (
                    SELECT 1 FROM role_permissions WHERE role_id = NEW.id AND permission IN {$manageAccess}
                ) THEN
                    RAISE EXCEPTION 'roles: a role limited to own cards cannot manage access'
                        USING ERRCODE = 'check_violation';
                END IF;
                RETURN NEW;
            END;
            \$\$;

            CREATE TRIGGER role_permissions_scope_check BEFORE INSERT OR UPDATE ON role_permissions
                FOR EACH ROW EXECUTE FUNCTION role_permissions_scope_check();
            CREATE TRIGGER roles_scope_check BEFORE UPDATE OF card_scope ON roles
                FOR EACH ROW EXECUTE FUNCTION roles_scope_check();
            SQL);

        $now = now();
        $position = 0;
        foreach (self::ROLES as $key => [$name, $scope, $permissions]) {
            $id = strtolower((string) Str::ulid());
            DB::table('roles')->insert([
                'id' => $id,
                'key' => $key,
                'name' => $name,
                'card_scope' => $scope,
                'position' => 'a'.$position++,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('role_permissions')->insert(array_map(
                fn (string $permission) => ['role_id' => $id, 'permission' => $permission],
                $permissions,
            ));
        }
    }

    private function createAccessGrants(): void
    {
        // Выдача доступа: субъект (пользователь или группа, в том числе «Все сотрудники») × узел дерева × роль.
        // В П2a узлы — только пространства; выдачи на папки и несколько ролей у субъекта — с П2d.
        // Строка удаляется при отзыве доступа (это доступ, а не человек или группа); история — в журнале.
        Schema::create('access_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('nav_node_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUlid('group_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignUlid('role_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('granted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampsTz();

            $table->index('nav_node_id');
            $table->index('user_id');
            $table->index('group_id');
            $table->index('role_id');
        });

        DB::statement('ALTER TABLE access_grants ADD CONSTRAINT access_grants_one_subject CHECK ((user_id IS NULL) <> (group_id IS NULL))');
        // Одна выдача на узел, субъекта и роль
        DB::statement('CREATE UNIQUE INDEX access_grants_user_role_unique ON access_grants (nav_node_id, user_id, role_id) WHERE user_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX access_grants_group_role_unique ON access_grants (nav_node_id, group_id, role_id) WHERE group_id IS NOT NULL');
        // До П2d у субъекта на узле одна роль — как было в space_members и space_groups; П2d снимает эти индексы
        DB::statement('CREATE UNIQUE INDEX access_grants_one_role_user ON access_grants (nav_node_id, user_id) WHERE user_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX access_grants_one_role_group ON access_grants (nav_node_id, group_id) WHERE group_id IS NOT NULL');
    }

    /** space_members и space_groups → выдачи на узлы пространств; сверка; старые таблицы удаляются. */
    private function moveLegacyAccess(): void
    {
        foreach (['user' => 'space_members', 'group' => 'space_groups'] as $subject => $table) {
            $key = sprintf(self::LEGACY_TO_KEY, 'old');
            DB::statement(<<<SQL
                INSERT INTO access_grants (nav_node_id, {$subject}_id, role_id, created_at, updated_at)
                SELECT n.id, old.{$subject}_id, r.id, old.created_at, old.updated_at
                  FROM {$table} old
                  JOIN nav_nodes n ON n.space_id = old.space_id
                  JOIN roles r ON r.key = {$key}
                SQL);
        }
        $this->ensureSameAccess();

        Schema::drop('space_groups');
        Schema::drop('space_members');
    }

    /**
     * Прежние таблицы и выдачи описывают один и тот же доступ: строк столько же, и каждая строка (пространство,
     * субъект, роль, флаг, даты) есть с обеих сторон. Иначе — исключение, транзакция миграции откатывается.
     */
    private function ensureSameAccess(): void
    {
        foreach (['user' => 'space_members', 'group' => 'space_groups'] as $subject => $table) {
            $legacy = (int) DB::table($table)->count();
            $grants = (int) DB::table('access_grants')->whereNotNull("{$subject}_id")->count();
            $key = sprintf(self::LEGACY_TO_KEY, 'old');
            $diff = DB::selectOne(<<<SQL
                SELECT count(*) AS n FROM (
                    (SELECT old.space_id, old.{$subject}_id, {$key} AS role_key, old.created_at, old.updated_at FROM {$table} old
                     EXCEPT
                     SELECT n.space_id, g.{$subject}_id, r.key, g.created_at, g.updated_at
                       FROM access_grants g JOIN nav_nodes n ON n.id = g.nav_node_id JOIN roles r ON r.id = g.role_id
                      WHERE g.{$subject}_id IS NOT NULL)
                    UNION ALL
                    (SELECT n.space_id, g.{$subject}_id, r.key, g.created_at, g.updated_at
                       FROM access_grants g JOIN nav_nodes n ON n.id = g.nav_node_id JOIN roles r ON r.id = g.role_id
                      WHERE g.{$subject}_id IS NOT NULL
                     EXCEPT
                     SELECT old.space_id, old.{$subject}_id, {$key}, old.created_at, old.updated_at FROM {$table} old)
                ) diff
                SQL)->n;

            if ($legacy !== $grants || $diff > 0) {
                throw new RuntimeException(
                    "Перенос доступа не сошёлся: {$table} — {$legacy} строк, выдач ({$subject}_id) — {$grants}, "
                    ."различающихся строк — {$diff}. Ничего не изменено (транзакция откатывается)."
                );
            }
        }
    }

    /** Откат возможен, только если выдачи выражаются прежней моделью без потерь. */
    private function ensureExpressibleInLegacyModel(): void
    {
        $problems = array_filter([
            'выдачи на папки' => DB::table('access_grants')
                ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
                ->whereNull('nav_nodes.space_id')->count(),
            'пользовательские роли' => DB::table('roles')
                ->where(fn ($q) => $q->whereNull('key')->orWhereNotIn('key', array_keys(self::ROLES)))->count(),
            'несколько ролей у субъекта на одном узле' => DB::query()->fromSub(DB::table('access_grants')
                ->select(['nav_node_id', 'user_id', 'group_id'])
                ->groupBy(['nav_node_id', 'user_id', 'group_id'])
                ->havingRaw('count(*) > 1'), 'repeated')->count(),
        ]);

        if ($problems !== []) {
            $list = implode(', ', array_map(fn (string $what, int $n) => "{$what}: {$n}", array_keys($problems), $problems));
            throw new RuntimeException(
                "Откат «Прав 2.0» (П2a) невозможен без потери данных — {$list}. Прежняя модель (space_members, "
                .'space_groups) их не выражает. Откат — только из бэкапа (make restore / make pm-restore).'
            );
        }
    }

    /** Таблицы до П2a — как их создали миграции этапов 1–3 (2026_10_12_200001, 2026_10_14_100001, 2026_10_17_100001). */
    private function createLegacyTables(): void
    {
        Schema::create('space_members', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->timestampsTz();
            $table->boolean('own_cards_only')->default(false);

            $table->unique(['space_id', 'user_id']);
            $table->index('user_id');
        });
        DB::statement("ALTER TABLE space_members ADD CONSTRAINT space_members_role_check CHECK (role IN ('admin', 'editor', 'commenter'))");
        DB::statement("ALTER TABLE space_members ADD CONSTRAINT space_members_admin_not_restricted CHECK (NOT (role = 'admin' AND own_cards_only))");

        Schema::create('space_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('group_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->boolean('own_cards_only')->default(false);
            $table->timestampsTz();

            $table->unique(['space_id', 'group_id']);
            $table->index('group_id');
        });
        DB::statement("ALTER TABLE space_groups ADD CONSTRAINT space_groups_role_check CHECK (role IN ('admin', 'editor', 'commenter'))");
        DB::statement("ALTER TABLE space_groups ADD CONSTRAINT space_groups_admin_not_restricted CHECK (NOT (role = 'admin' AND own_cards_only))");
    }
};
