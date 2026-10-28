<?php

use App\Enums\UserStatus;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\Notification;

/*
| Сквозной сценарий этапа 0 (критерий готовности):
| создать админа командой → войти → пригласить пользователя → письмо → принять приглашение
| и задать пароль → войти вторым пользователем → сменить пароль → выйти и сбросить пароль
| через почту → админ деактивирует пользователя → вход невозможен, сессия завершена.
*/
it('проходит сквозной сценарий этапа 0', function () {
    Notification::fake();

    // 1. Первый администратор создаётся командой
    $this->artisan('app:create-admin', [
        '--name' => 'Анна Админова',
        '--email' => 'anna@selen.test',
        '--password' => 'admin-password-1',
    ])->assertSuccessful();

    // 2. Администратор входит (первый созданный администратор — Владелец, этап 3c, ADR-0017)
    $adminBrowser = browser('10.0.0.1');
    $adminBrowser->post('/api/v1/auth/login', [
        'email' => 'anna@selen.test',
        'password' => 'admin-password-1',
    ])->assertOk()->assertJsonPath('data.role', 'owner');

    // 3. Приглашает пользователя
    $adminBrowser->post(adminPath().'invitations', [
        'name' => 'Борис Новиков',
        'email' => 'Boris@Selen.test',
        'role' => 'member',
    ])->assertCreated()->assertJsonPath('data.invitation.state', 'pending');

    $boris = User::query()->where('email', 'boris@selen.test')->firstOrFail();
    expect($boris->status)->toBe(UserStatus::Invited);

    // 4. Письмо с ссылкой ушло (токен — только в письме, в БД — хеш)
    $invitationToken = null;
    Notification::assertSentTo($boris, InvitationNotification::class, function (InvitationNotification $n) use (&$invitationToken, $boris) {
        $invitationToken = $n->token;
        $mail = $n->toMail($boris);

        return str_contains((string) $mail->actionUrl, '/invitations/'.$n->token)
            && ! str_contains(implode(' ', $mail->introLines), 'password');
    });

    // 5. Борис открывает ссылку и задаёт пароль — вход выполняется сразу
    $borisBrowser = browser('10.0.0.2');
    $borisBrowser->get("/api/v1/invitations/{$invitationToken}")
        ->assertOk()
        ->assertJsonPath('data.email', 'boris@selen.test');
    $borisBrowser->post("/api/v1/invitations/{$invitationToken}/accept", [
        'password' => 'boris-password-1',
        'password_confirmation' => 'boris-password-1',
    ])->assertOk()->assertJsonPath('data.status', 'active');
    $borisBrowser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'boris@selen.test');

    // Повторно ссылкой воспользоваться нельзя
    browser('10.0.0.3')->get("/api/v1/invitations/{$invitationToken}")
        ->assertStatus(410)->assertJsonPath('code', 'invitation_used');

    // 6. Борис выходит и входит заново своим паролем
    $borisBrowser->post('/api/v1/auth/logout')->assertNoContent();
    $borisBrowser->get('/api/v1/auth/me')->assertUnauthorized();
    $borisBrowser->post('/api/v1/auth/login', [
        'email' => 'boris@selen.test',
        'password' => 'boris-password-1',
        'remember' => true,
    ])->assertOk();

    // 7. Меняет пароль в профиле
    $borisBrowser->put('/api/v1/profile/password', [
        'current_password' => 'boris-password-1',
        'password' => 'boris-password-2',
        'password_confirmation' => 'boris-password-2',
    ])->assertOk();
    $borisBrowser->get('/api/v1/auth/me')->assertOk();

    // 8. Выходит и сбрасывает пароль через почту
    $borisBrowser->post('/api/v1/auth/logout')->assertNoContent();
    $borisBrowser->post('/api/v1/auth/forgot-password', ['email' => 'boris@selen.test'])->assertOk();

    $resetToken = null;
    Notification::assertSentTo($boris, ResetPasswordNotification::class, function (ResetPasswordNotification $n) use (&$resetToken, $boris) {
        $resetToken = $n->token;

        return str_contains((string) $n->toMail($boris)->actionUrl, '/reset-password/'.$n->token);
    });

    $borisBrowser->post('/api/v1/auth/reset-password', [
        'token' => $resetToken,
        'email' => 'boris@selen.test',
        'password' => 'boris-password-3',
        'password_confirmation' => 'boris-password-3',
    ])->assertOk();

    // Старый пароль не подходит, новый — подходит («Запомнить меня» на этот раз включено)
    $borisBrowser->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => 'boris-password-2'])
        ->assertUnprocessable();
    $borisBrowser->post('/api/v1/auth/login', [
        'email' => 'boris@selen.test',
        'password' => 'boris-password-3',
        'remember' => true,
    ])->assertOk();
    $borisBrowser->get('/api/v1/auth/me')->assertOk();

    // 9. Администратор деактивирует Бориса
    $adminBrowser->post(adminPath()."users/{$boris->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('data.status', 'deactivated');

    // 10. Активная сессия Бориса завершена — и по cookie сессии, и по cookie «Запомнить меня»
    $borisBrowser->get('/api/v1/auth/me')->assertUnauthorized();
    $borisBrowser->forgetCookie('selen-session');
    $borisBrowser->get('/api/v1/auth/me')->assertUnauthorized();

    // Войти снова невозможно
    $borisBrowser->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => 'boris-password-3'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.email.0', __('selen.auth.deactivated'));

    // 11. Все шаги видны в журнале событий
    expect(loggedEventTypes())->toBe([
        'user.created',
        'auth.login_succeeded',            // админ вошёл
        'user.invited',
        'invitation.accepted',
        'auth.login_succeeded',            // Борис вошёл по приглашению
        'auth.logout',
        'auth.login_succeeded',
        'auth.password_changed',
        'auth.logout',
        'auth.password_reset_requested',
        'auth.password_reset_completed',
        'auth.login_failed',               // старый пароль
        'auth.login_succeeded',
        'user.deactivated',
        'auth.login_failed',               // деактивирован
    ]);

    $adminBrowser->get(adminPath().'events')->assertOk()->assertJsonCount(15, 'data');

    // 12. В журнале нет персональных данных (решение этапа 1, ADR-0003)
    expectNoPersonalDataInEventLog();
});
