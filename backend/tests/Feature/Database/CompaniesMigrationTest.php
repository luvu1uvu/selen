<?php

use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\Group;
use App\Models\Invitation;
use App\Models\User;
use Database\Seeders\BoardsDemoSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\Support\AccessSnapshot;

/*
| Миграция компаний («Права 2.0», П2b-1: 2026_10_23_300001_create_companies, ADR-0024): всё, что есть, становится
| «Компанией 1». Проверки (журнал, раздел 6.2):
| - итоговые права до (замороженное правило П2a, AccessSnapshot::beforeCompanies) и после (AccessResolver) совпадают
|   по каждой паре «пользователь × пространство» и каждому действию;
| - системный администратор — администратор «Компании 1», Владелец — Владелец, каждый пользователь (и деактивированный,
|   и приглашённый) — её «дом»;
| - строки корневых таблиц те же, у каждой — «Компания 1»;
| - журнал событий не переписан: те же строки на тех же местах (ctid, xmin), у старых — «Компания 1», триггеры
|   append-only на месте;
| - откат возвращает прежние схему и данные; при второй компании — отказ.
| Схему меняет только владелец схемы (ADR-0016); всё — в его транзакции, которая откатывается.
*/

/** Таблицы, у которых миграция добавляет company_id. */
const COMPANY_TABLES = ['spaces', 'nav_nodes', 'groups', 'labels', 'card_types', 'invitations', 'access_grants', 'roles'];

/** Строки таблицы без company_id — сравнение «до» и «после». */
function rowsWithoutCompany(string $table): array
{
    return DB::table($table)->orderBy('id')->get()
        ->map(fn ($row) => collect((array) $row)->except('company_id')->map(fn ($v) => is_bool($v) ? (int) $v : $v)->all())
        ->all();
}

/** Журнал: строки, их физическое место и версия (UPDATE меняет ctid и xmin). */
function eventLogRows(): array
{
    return array_map(fn ($row) => (array) $row, DB::select(
        'SELECT id, ctid::text AS ctid, xmin::text AS xmin, occurred_at, event_type, actor_id, subject_type, subject_id, payload::text AS payload, meta::text AS meta FROM event_log ORDER BY id'
    ));
}

/** Триггеры истории append-only (ADR-0003, 0006, 0011) — не ослабляются. */
function historyTriggers(): array
{
    return array_map(fn ($row) => $row->name, DB::select(<<<'SQL'
        SELECT c.relname || '.' || t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND c.relname IN ('event_log', 'card_transitions', 'card_blocks') ORDER BY 1
        SQL));
}

/** Роли для показа до компаний: users.role (owner | admin | member). */
function legacySystemRoles(): array
{
    return DB::table('users')->orderBy('id')->pluck('role', 'id')->all();
}

/** То же после: Владелец; администратор «Компании 1»; участник. */
function companySystemRoles(): array
{
    $admins = DB::table('company_members')->where('is_admin', true)->pluck('user_id')->flip();

    return DB::table('users')->orderBy('id')->get(['id', 'role'])
        ->mapWithKeys(fn ($u) => [$u->id => $u->role === 'owner' ? 'owner' : ($admins->has($u->id) ? 'admin' : 'member')])
        ->all();
}

/** Демо-данные и крайние случаи: деактивированный и приглашённый администраторы, пользовательская роль, приглашение. */
function seedCompaniesMigrationCases(): void
{
    Storage::fake('attachments');
    test()->seed([DemoSeeder::class, BoardsDemoSeeder::class]);

    User::factory()->admin()->create(['status' => UserStatus::Deactivated, 'deactivated_at' => now()]);
    Invitation::factory()->create(['user_id' => User::factory()->admin()->invited()]);
    $custom = makeRole([Permission::CardComment, Permission::CardUpdate]);
    grantAccess(space(['key' => 'CUSTOM']), member(), $custom);
    // Источник через группу и «Все сотрудники» у пространства в папке
    $space = space(['key' => 'FOLDER']);
    placeIn(nodeOf($space), makeFolder('Папка перехода'));
    grantGroup($space, Group::everyone(company()), SpaceRole::Editor, ownCardsOnly: true);
}

it('переводит всё в «Компанию 1» без изменения прав, ролей и данных; журнал не переписан', function () {
    asSchemaOwner(function () {
        seedCompaniesMigrationCases();
        $migration = companiesMigration();
        $migration->down();

        // «До» — схема без компаний
        $rights = AccessSnapshot::beforeCompanies();
        $roles = legacySystemRoles();
        $rows = collect(COMPANY_TABLES)->mapWithKeys(fn (string $t) => [$t => rowsWithoutCompany($t)])->all();
        $events = eventLogRows();
        $triggers = historyTriggers();
        $users = DB::table('users')->count();

        $migration->up();

        $company = Company::query()->sole();
        expect($company->name)->toBe('Компания 1')
            ->and(AccessSnapshot::current())->toBe($rights)
            ->and(companySystemRoles())->toEqual($roles)
            ->and(DB::table('company_members')->where('company_id', $company->id)->where('kind', 'home')->count())->toBe($users)
            ->and(count($rights['pairs']))->toBeGreaterThan(20)
            ->and(collect($roles)->values()->unique()->sort()->values()->all())->toBe(['admin', 'member', 'owner']);

        foreach (COMPANY_TABLES as $table) {
            expect(rowsWithoutCompany($table))->toBe($rows[$table], $table);
            $expected = $table === 'roles' ? DB::table('roles')->whereNull('key')->count() : DB::table($table)->count();
            expect(DB::table($table)->where('company_id', $company->id)->count())->toBe($expected, $table);
        }
        expect(DB::table('roles')->whereNotNull('key')->whereNotNull('company_id')->count())->toBe(0);

        // Журнал: те же строки на тех же местах — UPDATE не было; у старых событий — «Компания 1»
        expect(eventLogRows())->toBe($events)
            ->and(count($events))->toBeGreaterThan(100)
            ->and(DB::table('event_log')->where('company_id', '!=', $company->id)->orWhereNull('company_id')->count())->toBe(0)
            // Триггеры append-only на месте и не изменились; добавлена только проверка вставки «одна компания»
            ->and(historyTriggers())->toBe(collect($triggers)->push('card_blocks.card_blocks_same_company')->sort()->values()->all())
            ->and($triggers)->toContain('event_log.event_log_append_only', 'card_transitions.card_transitions_append_only', 'card_blocks.card_blocks_only_close');
        // DEFAULT снят: новые события без компании — NULL
        expect(DB::selectOne("SELECT column_default FROM information_schema.columns WHERE table_name = 'event_log' AND column_name = 'company_id'")->column_default)
            ->toBeNull();
    });
});

it('откат возвращает прежние схему, роли и данные; повторный переход — то же', function () {
    asSchemaOwner(function () {
        seedCompaniesMigrationCases();
        $migration = companiesMigration();
        $migration->down();
        $rights = AccessSnapshot::beforeCompanies();
        $roles = legacySystemRoles();
        $rows = collect(COMPANY_TABLES)->mapWithKeys(fn (string $t) => [$t => rowsWithoutCompany($t)])->all();
        $events = eventLogRows();

        $migration->up();
        $migration->down();

        expect(Schema::hasTable('companies'))->toBeFalse()
            ->and(Schema::hasTable('company_members'))->toBeFalse()
            ->and(collect(COMPANY_TABLES)->filter(fn (string $t) => Schema::hasColumn($t, 'company_id'))->all())->toBe([])
            ->and(Schema::hasColumn('event_log', 'company_id'))->toBeFalse()
            ->and(AccessSnapshot::beforeCompanies())->toBe($rights)
            ->and(legacySystemRoles())->toEqual($roles)
            ->and(collect(COMPANY_TABLES)->mapWithKeys(fn (string $t) => [$t => rowsWithoutCompany($t)])->all())->toBe($rows)
            ->and(array_map(fn (array $r) => array_diff_key($r, ['ctid' => 1, 'xmin' => 1]), eventLogRows()))
            ->toBe(array_map(fn (array $r) => array_diff_key($r, ['ctid' => 1, 'xmin' => 1]), $events))
            // Прежние ограничения: название группы и тип карточки — уникальны во всём Selen, роль admin снова есть
            ->and(DB::selectOne("SELECT count(*) AS n FROM pg_indexes WHERE indexname IN ('groups_name_unique', 'card_types_name_unique', 'labels_active_name_unique')")->n)->toBe(3)
            ->and(DB::selectOne("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'users_role_check'")->def)->toContain("'admin'");

        $migration->up();
        expect(AccessSnapshot::current())->toBe($rights)
            ->and(companySystemRoles())->toEqual($roles);
    });
});

it('откат отказывает, если компаний больше одной: прежняя модель их не выражает', function () {
    asSchemaOwner(function () {
        otherCompany();

        expect(fn () => DB::transaction(fn () => companiesMigration()->down()))
            ->toThrow(RuntimeException::class, 'компаний: 2');
        expect(Schema::hasTable('companies'))->toBeTrue()
            ->and(Schema::hasColumn('spaces', 'company_id'))->toBeTrue();
    });
});

it('на новом сервере (пустая база) — «Компания 1» со «Все сотрудники» и типами карточек', function () {
    $company = Company::query()->sole();

    expect($company->name)->toBe('Компания 1')
        ->and(Group::everyone($company)->name)->toBe('Все сотрудники')
        ->and($company->cardTypes()->ordered()->pluck('name')->all())->toBe(['Задача', 'Баг', 'История', 'Эпик'])
        ->and(Company::primary()->is($company))->toBeTrue();
});

it('шаблон новой компании — «Все сотрудники» и те же четыре типа карточек, без меток и групп', function () {
    $other = otherCompany();

    expect($other->groups()->pluck('system_key')->all())->toBe(['everyone'])
        ->and($other->cardTypes()->ordered()->get(['name', 'color', 'is_default'])->toArray())
        ->toEqual(company()->cardTypes()->ordered()->get(['name', 'color', 'is_default'])->toArray())
        ->and($other->labels()->count())->toBe(0);
});
