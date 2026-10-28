<?php

use App\Enums\UserStatus;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use Database\Seeders\BoardsDemoSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\Support\AccessSnapshot;

/*
| Миграция «Прав 2.0», П2a (2026_10_23_200001_create_roles_and_access_grants, ADR-0024): space_members и space_groups
| переходят в выдачи со стандартными ролями без изменения прав. Снимок итоговых прав до (замороженное прежнее правило)
| и после (AccessResolver) совпадает по каждой паре «пользователь × пространство» и каждому действию; миграция сама
| сверяет строки, обратима и отказывает в откате, если выдачи прежней моделью не выразить.
| Схему меняет только владелец схемы (ADR-0016); всё — в его транзакции, которая откатывается.
| С П2b-1 миграция П2a — не последняя: сначала откатываются компании (companiesMigration), данные создаются заранее
| в текущей схеме (фабрики пишут company_id), прежние строки вставляются после отката; в конце цепочка поднимается
| обратно до компаний — права совпадают и с текущим резолвером.
*/

function accessGrantsMigration(): object
{
    return require database_path('migrations/2026_10_23_200001_create_roles_and_access_grants.php');
}

/**
 * Строки прежних таблиц без id — для сравнения «до» и «после отката».
 *
 * @return array{members: list<string>, groups: list<string>}
 */
function legacyRows(): array
{
    $rows = fn (string $table, string $subject) => DB::table($table)
        ->orderBy('id')
        ->get()
        ->map(fn ($r) => implode('|', [$r->space_id, $r->{$subject}, $r->role, $r->own_cards_only ? 'own' : 'all', $r->created_at, $r->updated_at]))
        ->sort()->values()->all();

    return ['members' => $rows('space_members', 'user_id'), 'groups' => $rows('space_groups', 'group_id')];
}

/**
 * Матрица случаев прежней модели — прямо в space_members и space_groups. Люди, пространства и группы создаются сразу
 * (в текущей схеме), строки прежних таблиц вставляет возвращённое замыкание — после отката до П2a.
 *
 * @return Closure(): void
 */
function seedLegacyAccessCases(): Closure
{
    $pending = [];
    $insert = function (string $table, array $row) use (&$pending) {
        $pending[] = [$table, $row + [
            'own_cards_only' => false,
            'created_at' => now()->subDays(random_int(1, 30)),
            'updated_at' => now(),
        ]];
    };
    $dev = space(['key' => 'DEV']);
    $ops = space(['key' => 'OPS']);
    $mkt = space(['key' => 'MKT']);

    $people = [];
    foreach (['admin', 'editor', 'commenter', 'editor_own', 'commenter_own', 'mixed', 'grouped', 'twice', 'invited', 'gone', 'gone_grouped'] as $who) {
        $people[$who] = member(match ($who) {
            'invited' => ['status' => UserStatus::Invited],
            'gone', 'gone_grouped' => ['status' => UserStatus::Deactivated, 'deactivated_at' => now()],
            default => [],
        });
    }

    // Лично: каждая роль и «только свои»; второй администратор деактивирован
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['admin']->id, 'role' => 'admin']);
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['editor']->id, 'role' => 'editor']);
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['commenter']->id, 'role' => 'commenter']);
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['editor_own']->id, 'role' => 'editor', 'own_cards_only' => true]);
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['commenter_own']->id, 'role' => 'commenter', 'own_cards_only' => true]);
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['gone']->id, 'role' => 'admin']);
    $insert('space_members', ['space_id' => $ops->id, 'user_id' => $people['gone']->id, 'role' => 'admin']);
    // Источники не смешиваются: лично «Комментатор» + группа «Редактор — только свои»
    $insert('space_members', ['space_id' => $dev->id, 'user_id' => $people['mixed']->id, 'role' => 'commenter']);

    $editorsOwn = addToGroup(makeGroup(), $people['mixed'], $people['grouped']);
    $admins = addToGroup(makeGroup(), $people['grouped'], $people['twice'], $people['gone_grouped']);
    $readers = addToGroup(makeGroup(), $people['twice'], $people['invited']);
    $archived = addToGroup(makeGroup(['archived_at' => now()]), $people['commenter'], $people['twice']);
    $insert('space_groups', ['space_id' => $dev->id, 'group_id' => $editorsOwn->id, 'role' => 'editor', 'own_cards_only' => true]);
    $insert('space_groups', ['space_id' => $ops->id, 'group_id' => $admins->id, 'role' => 'admin']);
    $insert('space_groups', ['space_id' => $ops->id, 'group_id' => $readers->id, 'role' => 'commenter']);
    $insert('space_groups', ['space_id' => $mkt->id, 'group_id' => $readers->id, 'role' => 'commenter', 'own_cards_only' => true]);
    $insert('space_groups', ['space_id' => $mkt->id, 'group_id' => $archived->id, 'role' => 'admin']);
    // «Все сотрудники»: активным — да, приглашённым и деактивированным — нет
    $insert('space_groups', ['space_id' => $mkt->id, 'group_id' => Group::everyone(company())->id, 'role' => 'editor']);
    $insert('space_groups', ['space_id' => $dev->id, 'group_id' => Group::everyone(company())->id, 'role' => 'commenter', 'own_cards_only' => true]);

    return function () use (&$pending) {
        foreach ($pending as [$table, $row]) {
            DB::table($table)->insert($row);
        }
    };
}

it('переносит матрицу случаев без изменения прав; откат возвращает те же строки', function () {
    asSchemaOwner(function () {
        $insertLegacy = seedLegacyAccessCases();
        $migration = accessGrantsMigration();
        companiesMigration()->down();
        $migration->down();
        $insertLegacy();
        $before = AccessSnapshot::legacy();
        $rows = legacyRows();

        $migration->up();

        expect(Schema::hasTable('space_members'))->toBeFalse()
            ->and(Schema::hasTable('space_groups'))->toBeFalse()
            ->and(DB::table('access_grants')->count())->toBe(count($rows['members']) + count($rows['groups']))
            ->and(AccessSnapshot::beforeCompanies())->toBe($before);

        // Снимок содержит все случаи: иначе сравнение ничего бы не доказывало
        expect(collect($before['pairs'])->pluck('sources')->flatten()->unique()->sort()->values()->all())
            ->toContain('personal:admin', 'personal:editor:own', 'personal:commenter:own')
            ->and(count($before['pairs']))->toBeGreaterThan(15)
            ->and($before['active_personal_admins'])->toHaveCount(1);

        $migration->down();
        expect(legacyRows())->toBe($rows)
            ->and(Schema::hasTable('access_grants'))->toBeFalse()
            ->and(Schema::hasTable('roles'))->toBeFalse();

        $migration->up();
        expect(AccessSnapshot::beforeCompanies())->toBe($before);

        // Вся цепочка до текущей схемы: права те же и по текущему резолверу (у тех, кто может войти: личная выдача
        // деактивированного с П2c прав не даёт — AccessSnapshot::activeUsers)
        companiesMigration()->up();
        expect(AccessSnapshot::activeUsers(AccessSnapshot::current()))->toBe(AccessSnapshot::activeUsers($before));
    });
});

it('демо-данные: права после отката к прежней модели и обратно не меняются', function () {
    Storage::fake('attachments');

    asSchemaOwner(function () {
        $this->seed([DemoSeeder::class, BoardsDemoSeeder::class]);
        $migration = accessGrantsMigration();
        // У тех, кто может войти (AccessSnapshot::activeUsers: деактивированным с П2c личная выдача прав не даёт)
        $active = fn (array $snapshot) => AccessSnapshot::activeUsers($snapshot);
        $after = $active(AccessSnapshot::current());

        companiesMigration()->down();
        expect($active(AccessSnapshot::beforeCompanies()))->toBe($after);
        $migration->down();
        expect($active(AccessSnapshot::legacy()))->toBe($after);

        $migration->up();
        expect($active(AccessSnapshot::beforeCompanies()))->toBe($after);
        companiesMigration()->up();
        expect($active(AccessSnapshot::current()))->toBe($after)
            ->and(count($after['pairs']))->toBeGreaterThan(20);
    });
});

it('не сошлось — исключение, ничего не меняется (пространство без узла дерева)', function () {
    asSchemaOwner(function () {
        $space = space(['key' => 'LOST']);
        $user = member();
        $migration = accessGrantsMigration();
        companiesMigration()->down();
        $migration->down();
        DB::table('space_members')->insert(['space_id' => $space->id, 'user_id' => $user->id, 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('nav_nodes')->where('space_id', $space->id)->delete();

        expect(fn () => DB::transaction(fn () => $migration->up()))
            ->toThrow(RuntimeException::class, 'Перенос доступа не сошёлся: space_members — 1 строк, выдач (user_id) — 0');

        expect(Schema::hasTable('access_grants'))->toBeFalse()
            ->and(DB::table('space_members')->count())->toBe(1);
    });
});

it('откат отказывает, если выдачи прежней моделью не выразить', function () {
    asSchemaOwner(function () {
        $space = space();
        $user = member();
        grantAccess($space, $user, makeRole([]));
        $migration = accessGrantsMigration();
        companiesMigration()->down();

        expect(fn () => DB::transaction(fn () => $migration->down()))
            ->toThrow(RuntimeException::class, 'пользовательские роли: 1');

        companiesMigration()->up();
        expect(Schema::hasTable('access_grants'))->toBeTrue()
            ->and(Schema::hasTable('space_members'))->toBeFalse()
            ->and(Space::query()->find($space->id)->accessOf(User::query()->findOrFail($user->id))->isMember())->toBeTrue();
    });
});
