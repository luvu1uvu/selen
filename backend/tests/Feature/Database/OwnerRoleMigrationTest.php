<?php

use App\Models\EventLogEntry;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/*
| Миграция роли «Владелец» (2026_10_21_100001_add_owner_role, ADR-0017): Владельцем становится самый ранний
| активный администратор; миграция обратима (down: Владелец → администратор, ограничения и триггер сняты).
| С П2b-1 системного администратора нет (users.role — owner | member): проверки идут в схеме до компаний —
| под владельцем схемы откатывается миграция компаний, люди с ролью admin создаются прямо в таблице.
*/

function ownerRoleMigration(): object
{
    return require database_path('migrations/2026_10_21_100001_add_owner_role.php');
}

/** Пользователь в схеме до компаний (фабрика пишет членство в компании) — прямо в таблице; id. */
function legacyUser(string $role, array $attributes = []): string
{
    $id = strtolower((string) Str::ulid());
    DB::table('users')->insert($attributes + [
        'id' => $id, 'name' => 'Человек '.Str::random(6), 'email' => Str::random(10).'@selen.test', 'password' => 'x',
        'role' => $role, 'status' => 'active', 'timezone' => 'Europe/Moscow', 'created_at' => now(), 'updated_at' => now(),
    ]);

    return $id;
}

it('назначает Владельцем самого раннего активного администратора и пишет событие', function () {
    asSchemaOwner(function () {
        companiesMigration()->down();
        legacyUser('member', ['created_at' => now()->subYears(3)]);
        legacyUser('admin', ['status' => 'deactivated', 'deactivated_at' => now(), 'created_at' => now()->subYears(2)]);
        legacyUser('admin', ['status' => 'invited', 'password' => null, 'created_at' => now()->subYears(2)]);
        $first = legacyUser('admin', ['created_at' => now()->subYear()]);
        $later = legacyUser('admin', ['created_at' => now()->subMonth()]);

        ownerRoleMigration()->assignFirstOwner();

        expect(DB::table('users')->where('id', $first)->value('role'))->toBe('owner')
            ->and(DB::table('users')->where('id', $later)->value('role'))->toBe('admin');

        $event = EventLogEntry::query()->sole();
        expect($event)
            ->event_type->toBe('user.ownership_transferred')
            ->actor_id->toBeNull()
            ->subject_type->toBe('user')
            ->subject_id->toBe($first)
            ->and($event->payload)->toEqual(['from_user_id' => null, 'to_user_id' => $first, 'via' => 'migration'])
            ->and($event->meta)->toEqual(['source' => 'console']);
        expectNoPersonalDataInEventLog();
    });
});

it('ничего не меняет, если Владелец уже есть или активных администраторов нет', function () {
    asSchemaOwner(function () {
        companiesMigration()->down();
        $owner = legacyUser('owner', ['created_at' => now()->subMonth()]);
        $admin = legacyUser('admin', ['created_at' => now()->subYear()]);

        ownerRoleMigration()->assignFirstOwner();

        expect(DB::table('users')->pluck('role', 'id')->all())->toEqual([$owner => 'owner', $admin => 'admin'])
            ->and(EventLogEntry::query()->count())->toBe(0);

        // База без Владельца и без активных админов
        DB::statement('SET CONSTRAINTS users_owner_kept DEFERRED');
        DB::table('users')->where('id', $owner)->update(['role' => 'member']);
        DB::table('users')->where('id', $admin)->update(['status' => 'deactivated']);
        ownerRoleMigration()->assignFirstOwner();

        expect(DB::table('users')->where('role', 'owner')->exists())->toBeFalse();
    });
});

it('обратима: down → up без ошибок, Владелец становится администратором и назначается снова', function () {
    // Схему меняет только владелец схемы (ADR-0016); всё — в его транзакции, которая откатывается
    asSchemaOwner(function () {
        $owner = owner(['created_at' => now()->subYear()]);
        $admin = admin(['created_at' => now()->subMonth()]);
        $migration = ownerRoleMigration();

        companiesMigration()->down();
        expect(DB::table('users')->pluck('role', 'id')->all())->toEqual([$owner->id => 'owner', $admin->id => 'admin']);

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

        companiesMigration()->up();
        expect(DB::table('users')->pluck('role', 'id')->all())->toEqual([$owner->id => 'owner', $admin->id => 'member'])
            ->and(DB::table('company_members')->where('user_id', $admin->id)->value('is_admin'))->toBeTrue();
    });
});
