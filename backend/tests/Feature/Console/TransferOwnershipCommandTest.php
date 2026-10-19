<?php

use App\Enums\UserRole;
use App\Models\EventLogEntry;
use App\Models\User;

/*
| Аварийная передача владения (ADR-0017): php artisan app:transfer-ownership EMAIL на сервере
| (на стенде PM — make pm-transfer-ownership). Событие — без автора, via: console.
*/

it('передаёт владение с подтверждением: бывший Владелец — администратор', function () {
    $owner = owner(['email' => 'old@selen.test']);
    $next = member(['email' => 'next@selen.test']);

    $this->artisan('app:transfer-ownership', ['email' => 'NEXT@selen.test'])
        ->expectsOutputToContain('Сейчас Владелец:')
        ->expectsConfirmation('Передать владение?', 'yes')
        ->expectsOutputToContain('old@selen.test — администратор')
        ->assertSuccessful();

    expect($next->fresh()->role)->toBe(UserRole::Owner)
        ->and($owner->fresh()->role)->toBe(UserRole::Admin);

    $event = EventLogEntry::query()->sole();
    expect($event)
        ->event_type->toBe('user.ownership_transferred')
        ->actor_id->toBeNull()
        ->subject_id->toBe($next->id)
        ->and($event->payload)->toEqual(['from_user_id' => $owner->id, 'to_user_id' => $next->id, 'via' => 'console']);
    expectNoPersonalDataInEventLog();
});

it('назначает Владельца, если его нет', function () {
    $admin = admin(['email' => 'admin@selen.test']);

    $this->artisan('app:transfer-ownership', ['email' => 'admin@selen.test', '--force' => true])
        ->expectsOutputToContain('не назначен')
        ->assertSuccessful();

    expect($admin->fresh()->role)->toBe(UserRole::Owner)
        ->and(EventLogEntry::query()->sole()->payload)->toEqual(['from_user_id' => null, 'to_user_id' => $admin->id, 'via' => 'console']);
});

it('без подтверждения ничего не меняет', function () {
    $owner = owner();
    $next = member(['email' => 'next@selen.test']);

    $this->artisan('app:transfer-ownership', ['email' => 'next@selen.test'])
        ->expectsConfirmation('Передать владение?', 'no')
        ->assertFailed();

    expect($owner->fresh()->role)->toBe(UserRole::Owner)
        ->and($next->fresh()->role)->toBe(UserRole::Member)
        ->and(EventLogEntry::query()->count())->toBe(0);
});

it('отказывает неизвестному, неактивному и самому Владельцу — понятной ошибкой', function () {
    $owner = owner(['email' => 'owner@selen.test']);
    User::factory()->deactivated()->create(['email' => 'gone@selen.test']);

    $this->artisan('app:transfer-ownership', ['email' => 'nobody@selen.test', '--force' => true])
        ->expectsOutputToContain('Нет пользователя с email nobody@selen.test')->assertFailed();
    $this->artisan('app:transfer-ownership', ['email' => 'gone@selen.test', '--force' => true])
        ->expectsOutputToContain(__('selen.users.owner_target_not_active'))->assertFailed();
    $this->artisan('app:transfer-ownership', ['email' => 'owner@selen.test', '--force' => true])
        ->expectsOutputToContain(__('selen.users.already_owner'))->assertFailed();

    expect($owner->fresh()->role)->toBe(UserRole::Owner)
        ->and(EventLogEntry::query()->count())->toBe(0);
});

it('app:owner показывает Владельца и с какого момента', function () {
    owner(['name' => 'Ольга', 'email' => 'olga@selen.test']);
    $this->artisan('app:transfer-ownership', ['email' => member(['email' => 'pm@selen.test', 'name' => 'Пётр'])->email, '--force' => true]);

    $this->artisan('app:owner')
        ->expectsOutputToContain('Пётр <pm@selen.test>')
        ->expectsOutputToContain('(console)')
        ->assertSuccessful();
});

it('app:owner подсказывает, как назначить Владельца, если его нет', function () {
    admin();

    $this->artisan('app:owner')
        ->expectsOutputToContain('Владелец не назначен')
        ->assertFailed();
});
