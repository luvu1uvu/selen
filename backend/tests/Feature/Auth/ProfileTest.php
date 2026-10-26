<?php

use App\Models\EventLogEntry;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

it('меняет имя и часовой пояс и пишет изменения в журнал', function () {
    $user = member(['name' => 'Борис']);

    $this->actingAs($user)->patchJson('/api/v1/profile', ['name' => 'Борис Петров', 'timezone' => 'Asia/Yekaterinburg'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Борис Петров')
        ->assertJsonPath('data.timezone', 'Asia/Yekaterinburg');

    // toEqual, а не toBe: JSONB не сохраняет порядок ключей
    // Имя — ПДн: в журнале только факт изменения поля
    expect(EventLogEntry::query()->sole()->payload)->toEqual([
        'fields' => ['name', 'timezone'],
        'timezone' => ['from' => 'Europe/Moscow', 'to' => 'Asia/Yekaterinburg'],
    ]);
});

it('не пишет событие, если профиль не изменился', function () {
    $user = member(['name' => 'Борис']);

    $this->actingAs($user)->patchJson('/api/v1/profile', ['name' => 'Борис', 'timezone' => 'Europe/Moscow'])->assertOk();

    expect(loggedEventTypes())->toBe([]);
});

it('отклоняет несуществующий часовой пояс', function () {
    $this->actingAs(member())->patchJson('/api/v1/profile', ['name' => 'X', 'timezone' => 'Mars/Olympus'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('timezone');
});

it('не позволяет менять email и роль через профиль', function () {
    $user = member(['email' => 'user@selen.test']);

    $this->actingAs($user)->patchJson('/api/v1/profile', [
        'name' => 'X', 'timezone' => 'Europe/Moscow', 'email' => 'hacker@selen.test', 'role' => 'admin',
    ])->assertOk();

    expect($user->fresh())->email->toBe('user@selen.test')->administers(company())->toBeFalse();
});

it('меняет пароль с проверкой текущего и завершает остальные сессии', function () {
    $user = member(['email' => 'user@selen.test']);
    $laptop = browser('10.0.0.1');
    $phone = browser('10.0.0.2');
    $laptop->post('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
    $phone->post('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();

    $laptop->put('/api/v1/profile/password', [
        'current_password' => UserFactory::PASSWORD,
        'password' => 'new-password-123',
        'password_confirmation' => 'new-password-123',
    ])->assertOk();

    expect(Hash::check('new-password-123', $user->fresh()->password))->toBeTrue();
    $laptop->get('/api/v1/auth/me')->assertOk();
    $phone->get('/api/v1/auth/me')->assertUnauthorized();
    expect(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(1)
        ->and(loggedEventTypes())->toContain('auth.password_changed');
});

it('сохраняет «Запомнить меня» на текущем устройстве после смены пароля', function () {
    member(['email' => 'user@selen.test']);
    $laptop = browser();
    $laptop->post('/api/v1/auth/login', [
        'email' => 'user@selen.test', 'password' => UserFactory::PASSWORD, 'remember' => true,
    ])->assertOk();

    $laptop->put('/api/v1/profile/password', [
        'current_password' => UserFactory::PASSWORD,
        'password' => 'new-password-123',
        'password_confirmation' => 'new-password-123',
    ])->assertOk();

    $laptop->forgetCookie('selen-session');
    $laptop->get('/api/v1/auth/me')->assertOk();
});

it('не меняет пароль при неверном текущем', function () {
    $user = member();

    $this->actingAs($user)->putJson('/api/v1/profile/password', [
        'current_password' => 'wrong-password',
        'password' => 'new-password-123',
        'password_confirmation' => 'new-password-123',
    ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

    expect(Hash::check(UserFactory::PASSWORD, $user->fresh()->password))->toBeTrue();
});

it('требует, чтобы новый пароль отличался от текущего', function () {
    $this->actingAs(member())->putJson('/api/v1/profile/password', [
        'current_password' => UserFactory::PASSWORD,
        'password' => UserFactory::PASSWORD,
        'password_confirmation' => UserFactory::PASSWORD,
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});
