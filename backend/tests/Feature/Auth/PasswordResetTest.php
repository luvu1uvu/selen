<?php

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

beforeEach(fn () => Notification::fake());

it('отправляет ссылку для сброса активному пользователю', function () {
    $user = member(['email' => 'user@selen.test']);

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'user@selen.test'])
        ->assertOk()
        ->assertJsonPath('message', __('selen.password_reset.link_sent'));

    Notification::assertSentTo($user, ResetPasswordNotification::class, function (ResetPasswordNotification $n) use ($user) {
        $mail = $n->toMail($user);

        return str_starts_with((string) $mail->actionUrl, 'http://localhost/reset-password/')
            && str_contains((string) $mail->actionUrl, 'email=user%40selen.test')
            && $mail->subject === 'Сброс пароля в Selen';
    });
    expect(loggedEventTypes())->toBe(['auth.password_reset_requested']);
});

it('отвечает одинаково для несуществующего и деактивированного email и ничего не отправляет', function () {
    User::factory()->deactivated()->create(['email' => 'gone@selen.test']);

    foreach (['nobody@selen.test', 'gone@selen.test'] as $email) {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $email])
            ->assertOk()
            ->assertJsonPath('message', __('selen.password_reset.link_sent'));
    }

    Notification::assertNothingSent();
    expect(loggedEventTypes())->toBe([]);
});

it('сбрасывает пароль по токену и завершает все сессии', function () {
    $user = member(['email' => 'user@selen.test']);
    $token = Password::broker()->createToken($user);
    DB::table('sessions')->insert([
        'id' => 'old-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time(),
    ]);
    $oldRememberToken = $user->remember_token;

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => $token,
        'email' => 'user@selen.test',
        'password' => 'brand-new-password',
        'password_confirmation' => 'brand-new-password',
    ])->assertOk();

    $user->refresh();
    expect(Hash::check('brand-new-password', $user->password))->toBeTrue()
        ->and($user->remember_token)->not->toBe($oldRememberToken)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(loggedEventTypes())->toBe(['auth.password_reset_completed']);
});

it('отклоняет неверный токен сброса', function () {
    member(['email' => 'user@selen.test']);

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => 'wrong-token',
        'email' => 'user@selen.test',
        'password' => 'brand-new-password',
        'password_confirmation' => 'brand-new-password',
    ])->assertUnprocessable()->assertJsonValidationErrors('email');
});

it('не раскрывает существование email при сбросе', function () {
    $this->postJson('/api/v1/auth/reset-password', [
        'token' => 'any-token',
        'email' => 'nobody@selen.test',
        'password' => 'brand-new-password',
        'password_confirmation' => 'brand-new-password',
    ])->assertUnprocessable()->assertJsonPath('errors.email.0', __('passwords.token'));
});

it('требует пароль не короче 10 символов и подтверждение', function () {
    $this->postJson('/api/v1/auth/reset-password', [
        'token' => 'x', 'email' => 'user@selen.test', 'password' => 'short', 'password_confirmation' => 'other',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});

it('ограничивает число запросов сброса пароля', function () {
    foreach (range(1, 3) as $attempt) {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'user@selen.test'])->assertOk();
    }

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'user@selen.test'])->assertTooManyRequests();
});

it('старый пароль после сброса не работает', function () {
    $user = member(['email' => 'user@selen.test']);
    $token = Password::broker()->createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => $token, 'email' => 'user@selen.test',
        'password' => 'brand-new-password', 'password_confirmation' => 'brand-new-password',
    ])->assertOk();

    $this->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertUnprocessable();
});
