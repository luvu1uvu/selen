<?php

use App\Models\AuthAuditEntry;
use App\Models\EventLogEntry;
use App\Models\User;
use Database\Factories\UserFactory;

it('впускает активного пользователя и фиксирует вход', function () {
    $user = member(['email' => 'user@selen.test']);

    $this->postJson('/api/v1/auth/login', ['email' => 'USER@selen.test ', 'password' => UserFactory::PASSWORD])
        ->assertOk()
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonMissingPath('data.password');

    expect($user->fresh()->last_login_at)->not->toBeNull();
    $this->assertAuthenticatedAs($user);

    $event = EventLogEntry::query()->sole();
    expect($event->event_type)->toBe('auth.login_succeeded')
        ->and($event->actor_id)->toBe($user->id)
        ->and($event->meta)->toEqual(['source' => 'http']);

    // IP и user agent — не в журнале, а в auth_audit (ограниченный срок хранения)
    $audit = AuthAuditEntry::query()->sole();
    expect($audit->event_log_id)->toBe($event->id)
        ->and($audit->user_id)->toBe($user->id)
        ->and($audit->ip)->toBe('127.0.0.1')
        ->and($audit->email_attempted)->toBeNull();
});

it('не впускает с неверным паролем и пишет неудачную попытку в журнал', function () {
    $user = member(['email' => 'user@selen.test']);

    $this->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => 'wrong-password'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Неверный email или пароль.');

    $this->assertGuest();
    $event = EventLogEntry::query()->sole();
    expect($event->event_type)->toBe('auth.login_failed')
        ->and($event->actor_id)->toBeNull()
        ->and($event->subject_id)->toBe($user->id)
        ->and($event->payload)->toEqual(['reason' => 'invalid_credentials']);
    expect(AuthAuditEntry::query()->sole())
        ->user_id->toBe($user->id)
        ->email_attempted->toBeNull();
});

it('не раскрывает, существует ли email', function () {
    $this->postJson('/api/v1/auth/login', ['email' => 'nobody@selen.test', 'password' => 'whatever-123'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', 'Неверный email или пароль.');

    // Введённый адрес неизвестного пользователя сохраняется только в auth_audit
    expect(EventLogEntry::query()->sole()->payload)->toEqual(['reason' => 'invalid_credentials'])
        ->and(AuthAuditEntry::query()->sole())
        ->user_id->toBeNull()
        ->email_attempted->toBe('nobody@selen.test');
});

it('не впускает деактивированного пользователя', function () {
    User::factory()->deactivated()->create(['email' => 'gone@selen.test']);

    $this->postJson('/api/v1/auth/login', ['email' => 'gone@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', __('selen.auth.deactivated'));

    $this->assertGuest();
    expect(EventLogEntry::query()->sole()->payload['reason'])->toBe('inactive');
});

it('не впускает приглашённого, который ещё не задал пароль', function () {
    User::factory()->invited()->create(['email' => 'new@selen.test']);

    $this->postJson('/api/v1/auth/login', ['email' => 'new@selen.test', 'password' => 'anything-123'])
        ->assertUnprocessable();
});

it('валидирует поля формы входа', function () {
    $this->postJson('/api/v1/auth/login', ['email' => 'not-an-email'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email', 'password']);
});

it('ограничивает число попыток входа', function () {
    member(['email' => 'user@selen.test']);

    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => 'wrong'])
            ->assertUnprocessable();
    }

    $this->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertTooManyRequests()
        ->assertJsonPath('message', fn (string $message) => str_contains($message, 'Слишком много попыток'));
});

// LATER-61: X-Forwarded-For присылает сам клиент — новый адрес в заголовке не даёт новых попыток (ADR-0021)
it('не даёт обойти лимит входа подменой X-Forwarded-For', function () {
    member(['email' => 'user@selen.test']);

    foreach (range(1, 5) as $attempt) {
        $this->withHeader('X-Forwarded-For', "10.0.0.{$attempt}")
            ->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => 'wrong'])
            ->assertUnprocessable();
    }

    $this->withHeader('X-Forwarded-For', '10.0.0.6')
        ->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => 'wrong'])
        ->assertTooManyRequests();
});

it('ограничивает попытки входа в одну учётную запись и с разных IP', function () {
    member(['email' => 'user@selen.test']);
    member(['email' => 'other@selen.test']);

    foreach (range(1, 10) as $attempt) {
        $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$attempt}"])
            ->postJson('/api/v1/auth/login', ['email' => $attempt % 2 ? 'user@selen.test' : 'USER@selen.test', 'password' => 'wrong'])
            ->assertUnprocessable();
    }

    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.11'])
        ->postJson('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertTooManyRequests();

    // Лимит — на учётную запись: другая с того же адреса входит
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.11'])
        ->postJson('/api/v1/auth/login', ['email' => 'other@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertOk();
});

it('пишет в auth_audit адрес соединения, а не X-Forwarded-For от клиента', function () {
    $this->withHeader('X-Forwarded-For', '10.9.9.9')
        ->postJson('/api/v1/auth/login', ['email' => 'nobody@selen.test', 'password' => 'whatever-123'])
        ->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe('127.0.0.1');
});

it('с «Запомнить меня» восстанавливает вход после закрытия браузера', function () {
    member(['email' => 'user@selen.test']);
    $browser = browser();

    $browser->post('/api/v1/auth/login', [
        'email' => 'user@selen.test',
        'password' => UserFactory::PASSWORD,
        'remember' => true,
    ])->assertOk();
    expect($browser->hasCookie('remember_web_'))->toBeTrue();

    $browser->forgetCookie('selen-session');
    $browser->get('/api/v1/auth/me')->assertOk();
});

it('без «Запомнить меня» не выдаёт долгоживущую cookie', function () {
    member(['email' => 'user@selen.test']);
    $browser = browser();

    $browser->post('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD])
        ->assertOk();
    expect($browser->hasCookie('remember_web_'))->toBeFalse();

    $browser->forgetCookie('selen-session');
    $browser->get('/api/v1/auth/me')->assertUnauthorized();
});

it('выход завершает сессию и пишет событие', function () {
    $user = member(['email' => 'user@selen.test']);
    $browser = browser();
    $browser->post('/api/v1/auth/login', ['email' => 'user@selen.test', 'password' => UserFactory::PASSWORD]);

    $browser->post('/api/v1/auth/logout')->assertNoContent();

    $browser->get('/api/v1/auth/me')->assertUnauthorized();
    expect(loggedEventTypes())->toBe(['auth.login_succeeded', 'auth.logout'])
        ->and(EventLogEntry::query()->latest('id')->first()->actor_id)->toBe($user->id);
});

it('отвечает 401 гостю на защищённых маршрутах', function () {
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
    $this->getJson(adminPath().'users')->assertUnauthorized();
});

it('возвращает текущего пользователя', function () {
    $user = member();

    $this->actingAs($user)->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.email', $user->email)
        ->assertJsonPath('data.timezone', 'Europe/Moscow');
});

it('выкидывает деактивированного пользователя даже с уцелевшей сессией', function () {
    $user = User::factory()->deactivated()->create();

    $this->actingAs($user)->getJson('/api/v1/auth/me')
        ->assertUnauthorized()
        ->assertJsonPath('message', __('selen.auth.deactivated'));
});
