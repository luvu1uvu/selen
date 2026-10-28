<?php

use App\Enums\SpaceRole;
use App\Models\CompanyPermissionGrant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\AccessSnapshot;

/*
| Миграция П2c-1 («Права 2.0»): гости, «убран из компании», блокировка Владельцем, права компании. Переход: у нынешних
| деактивированных (деактивация была у учётной записи) все «дома» получают отметку — для людей ничего не меняется;
| права тех, кто может войти, — те же. Откат возвращает прежнюю схему или отказывает, если её данные невыразимы.
*/

it('переход: деактивированные убраны из своих компаний, права тех, кто может войти, не изменились; откат и повтор', function () {
    asSchemaOwner(function () {
        $gone = User::factory()->deactivated()->create();
        $active = member();
        $space = space(['key' => 'DEV']);
        addToSpace($space, $gone, SpaceRole::Admin);
        addToSpace($space, $active, SpaceRole::Editor);
        $migration = guestsMigration();
        $before = AccessSnapshot::activeUsers(AccessSnapshot::current());
        $migration->down();
        expect(Schema::hasColumn('company_members', 'deactivated_at'))->toBeFalse()
            ->and(DB::table('users')->where('id', $gone->id)->value('status'))->toBe('deactivated');

        $migration->up();

        $membership = fn (User $user) => DB::table('company_members')->where('user_id', $user->id)->sole();
        expect($membership($gone)->deactivated_at)->not->toBeNull()
            ->and($membership($active)->deactivated_at)->toBeNull()
            ->and(AccessSnapshot::activeUsers(AccessSnapshot::current()))->toBe($before)
            ->and(Schema::hasTable('company_permission_grants'))->toBeTrue();

        $migration->down();
        $migration->up();
        expect(AccessSnapshot::activeUsers(AccessSnapshot::current()))->toBe($before);
    });
});

it('откат отказывает, если есть гости, права компании, отключённые Владельцем или деактивированные в одной компании', function (Closure $make, string $what) {
    asSchemaOwner(function () use ($make, $what) {
        $make();

        expect(fn () => DB::transaction(fn () => guestsMigration()->down()))->toThrow(RuntimeException::class, $what);
        expect(Schema::hasTable('company_permission_grants'))->toBeTrue();
    });
})->with([
    'гость' => [fn () => User::factory()->inCompany(otherCompany())->guestIn(company())->create(), 'гости: 1'],
    'право компании' => [fn () => CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => member()->id, 'permission' => 'company.invite_users']), 'права компании: 1'],
    'отключён Владельцем' => [fn () => User::factory()->blocked()->create(), 'отключённые Владельцем: 1'],
    'убран из одной компании' => [function () {
        $both = member();
        $both->companies()->attach(otherCompany()->id, ['kind' => 'home']);
        $both->companies()->updateExistingPivot(company()->id, ['deactivated_at' => now()]);
    }, 'деактивированы в одной компании, работают в другой: 1'],
]);

it('переход не сходится — исключение, ничего не меняется (активный без «дома»)', function () {
    asSchemaOwner(function () {
        $migration = guestsMigration();
        $lonely = member();
        DB::table('company_members')->where('user_id', $lonely->id)->delete();
        $migration->down();

        expect(fn () => DB::transaction(fn () => $migration->up()))
            ->toThrow(RuntimeException::class, 'активных или приглашённых без «дома» — 1');
        expect(Schema::hasTable('company_permission_grants'))->toBeFalse();
    });
});
