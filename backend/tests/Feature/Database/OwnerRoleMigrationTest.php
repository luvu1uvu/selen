<?php

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\EventLogEntry;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Миграция роли «Владелец» (2026_10_21_100001_add_owner_role, ADR-0017): Владельцем становится самый ранний
| активный администратор; миграция обратима (down: Владелец → администратор, ограничения и триггер сняты).
*/

function ownerRoleMigration(): object
{
    return require database_path('migrations/2026_10_21_100001_add_owner_role.php');
}

it('назначает Владельцем самого раннего активного администратора и пишет событие', function () {
    member(['created_at' => now()->subYears(3)]);
    User::factory()->admin()->create(['status' => UserStatus::Deactivated, 'deactivated_at' => now(), 'created_at' => now()->subYears(2)]);
    User::factory()->admin()->invited()->create(['created_at' => now()->subYears(2)]);
    $first = admin(['created_at' => now()->subYear()]);
    $later = admin(['created_at' => now()->subMonth()]);

    ownerRoleMigration()->assignFirstOwner();

    expect($first->fresh()->role)->toBe(UserRole::Owner)
        ->and($later->fresh()->role)->toBe(UserRole::Admin);

    $event = EventLogEntry::query()->sole();
    expect($event)
        ->event_type->toBe('user.ownership_transferred')
        ->actor_id->toBeNull()
        ->subject_type->toBe('user')
        ->subject_id->toBe($first->id)
        ->and($event->payload)->toEqual(['from_user_id' => null, 'to_user_id' => $first->id, 'via' => 'migration'])
        ->and($event->meta)->toEqual(['source' => 'console']);
    expectNoPersonalDataInEventLog();
});

it('ничего не меняет, если Владелец уже есть или активных администраторов нет', function () {
    $owner = owner(['created_at' => now()->subMonth()]);
    $admin = admin(['created_at' => now()->subYear()]);

    ownerRoleMigration()->assignFirstOwner();

    expect($owner->fresh()->role)->toBe(UserRole::Owner)
        ->and($admin->fresh()->role)->toBe(UserRole::Admin)
        ->and(EventLogEntry::query()->count())->toBe(0);

    $owner->forceFill(['role' => UserRole::Member])->save();   // база без Владельца и без активных админов
    $admin->forceFill(['status' => UserStatus::Deactivated])->save();
    ownerRoleMigration()->assignFirstOwner();

    expect(User::query()->where('role', UserRole::Owner)->exists())->toBeFalse();
});

it('обратима: down → up без ошибок, Владелец становится администратором и назначается снова', function () {
    // Схему меняет только владелец схемы (ADR-0016); всё — в его транзакции, которая откатывается
    $connection = DB::connection('pgsql_owner');
    $connection->statement("SET lock_timeout = '3s'");
    $connection->beginTransaction();

    try {
        DB::usingConnection('pgsql_owner', function () {
            $owner = owner(['created_at' => now()->subYear()]);
            $admin = admin(['created_at' => now()->subMonth()]);
            $migration = ownerRoleMigration();

            $migration->down();
            expect(DB::table('users')->pluck('role', 'id')->all())->toEqual([$owner->id => 'admin', $admin->id => 'admin'])
                ->and(DB::selectOne("SELECT count(*) AS n FROM pg_trigger WHERE tgname = 'users_owner_kept'")->n)->toBe(0)
                ->and(DB::selectOne("SELECT count(*) AS n FROM pg_indexes WHERE indexname = 'users_single_owner'")->n)->toBe(0);
            // Старое ограничение ролей вернулось: owner недопустим
            expect(fn () => DB::transaction(fn () => DB::table('users')->where('id', $admin->id)->update(['role' => 'owner'])))
                ->toThrow(QueryException::class, 'users_role_check');

            $migration->up();
            expect(DB::table('users')->pluck('role', 'id')->all())->toEqual([$owner->id => 'owner', $admin->id => 'admin'])
                ->and(DB::selectOne("SELECT count(*) AS n FROM pg_trigger WHERE tgname = 'users_owner_kept'")->n)->toBe(1);
        });
    } finally {
        $connection->rollBack();
    }
});
