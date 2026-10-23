<?php

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\EventLogEntry;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('первым создаёт Владельца, если его ещё нет', function () {
    $this->artisan('app:create-admin', [
        '--name' => 'Анна Админова',
        '--email' => 'Anna@Selen.test',
        '--password' => 'admin-password-1',
    ])->expectsOutputToContain('anna@selen.test')->assertSuccessful();

    $user = User::query()->sole();
    expect($user)
        ->email->toBe('anna@selen.test')
        ->role->toBe(UserRole::Owner)
        ->status->toBe(UserStatus::Active)
        ->and(Hash::check('admin-password-1', $user->password))->toBeTrue();

    expect(EventLogEntry::query()->sole())
        ->event_type->toBe('user.created')
        ->actor_id->toBeNull()
        ->payload->toMatchArray(['via' => 'console', 'role' => 'owner']);
});

it('создаёт администратора, если Владелец уже есть', function () {
    owner();

    $this->artisan('app:create-admin', [
        '--name' => 'Анна Админова', '--email' => 'anna@selen.test', '--password' => 'admin-password-1',
    ])->expectsOutputToContain('Администратор anna@selen.test создан')->assertSuccessful();

    // Администратор «Компании 1» (ADR-0024: администраторы — у компаний)
    expect(User::query()->where('email', 'anna@selen.test')->sole()->administers(company()))->toBeTrue()
        ->and(EventLogEntry::query()->sole()->payload)->toMatchArray(['via' => 'console', 'role' => 'admin']);
});

it('создаёт администратора в интерактивном режиме', function () {
    $this->artisan('app:create-admin')
        ->expectsQuestion('Имя администратора', 'Анна')
        ->expectsQuestion('Email', 'anna@selen.test')
        ->expectsQuestion('Пароль', 'admin-password-1')
        ->assertSuccessful();

    expect(User::query()->sole()->administers(company()))->toBeTrue();
});

it('отказывает, если email занят', function () {
    member(['email' => 'anna@selen.test']);

    $this->artisan('app:create-admin', [
        '--name' => 'Анна', '--email' => 'anna@selen.test', '--password' => 'admin-password-1',
    ])->assertFailed();

    expect(User::query()->count())->toBe(1);
});

it('отказывает при коротком пароле', function () {
    $this->artisan('app:create-admin', [
        '--name' => 'Анна', '--email' => 'anna@selen.test', '--password' => 'short',
    ])->assertFailed();

    expect(User::query()->count())->toBe(0);
});
