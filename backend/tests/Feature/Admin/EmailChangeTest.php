<?php

use App\Enums\Permission;
use App\Models\AuthAuditEntry;
use App\Models\CompanyPermissionGrant;
use App\Models\EmailChangeRequest;
use App\Models\EventLogEntry;
use App\Models\User;
use App\Notifications\EmailChangeConfirmationNotification;
use App\Notifications\EmailChangedNotification;
use App\Notifications\EmailChangeRequestedNotification;
use Database\Factories\UserFactory;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

/*
| Смена email администратором (П2c-2, LATER-9; решение PM 28.10): email меняется после перехода по ссылке из письма на
| новый адрес; на прежний — уведомление; после подтверждения сеансы завершаются; в журнале — без адресов.
*/

beforeEach(function () {
    Notification::fake();
    $this->admin = admin();
    $this->user = member(['name' => 'Борис Петров', 'email' => 'boris@selen.test']);
});

/** Запросить смену и вернуть токен из письма на новый адрес. */
function requestEmailChange(object $test, User $actor, User $user, string $email): string
{
    $test->actingAs($actor)->postJson(adminPath()."users/{$user->id}/email-change", ['email' => $email])->assertOk();
    $token = null;
    Notification::assertSentTo(new AnonymousNotifiable, EmailChangeConfirmationNotification::class,
        function (EmailChangeConfirmationNotification $notification, array $channels, AnonymousNotifiable $notifiable) use ($email, &$token) {
            $token = $notification->token;

            return $notifiable->routes['mail'] === $email;
        });

    return (string) $token;
}

it('запрос: email прежний, письмо со ссылкой — на новый адрес, уведомление с маской — на прежний; событие без адресов', function () {
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$this->user->id}/email-change", ['email' => ' Boris.New@Selen.TEST '])
        ->assertOk()
        ->assertJsonPath('data.email', 'boris@selen.test')
        ->assertJsonPath('data.email_change.email', 'boris.new@selen.test')
        ->assertJsonPath('data.email_change.expired', false);

    expect($this->user->fresh()->email)->toBe('boris@selen.test');
    Notification::assertSentTo(new AnonymousNotifiable, EmailChangeConfirmationNotification::class,
        fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'boris.new@selen.test');
    Notification::assertSentTo(new AnonymousNotifiable, EmailChangeRequestedNotification::class,
        function (EmailChangeRequestedNotification $n, $c, AnonymousNotifiable $to) {
            $mail = $n->toMail($to);

            return $to->routes['mail'] === 'boris@selen.test'
                && $n->maskedEmail === 'b***@selen.test'
                && str_contains(implode(' ', $mail->introLines), 'b***@selen.test')
                && ! str_contains(implode(' ', $mail->introLines), 'boris.new');
        });

    $event = EventLogEntry::query()->sole();
    expect($event->event_type)->toBe('user.email_change_requested')
        ->and($event->actor_id)->toBe($this->admin->id)
        ->and($event->subject_id)->toBe($this->user->id)
        ->and($event->company_id)->toBe(company()->id);
    // Строка запроса хранит только хеш токена
    expect(EmailChangeRequest::query()->sole()->token_hash)->toHaveLength(64);
    expectNoPersonalDataInEventLog();
});

it('подтверждение по ссылке: email новый, сеансы завершены, сброс пароля на прежний адрес не работает, вход — с новым', function () {
    $token = requestEmailChange($this, $this->admin, $this->user, 'boris.new@selen.test');
    $session = browser();
    $session->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
    Password::broker()->createToken($this->user->fresh());
    expect(DB::table('password_reset_tokens')->where('email', 'boris@selen.test')->count())->toBe(1);

    // Страница ссылки показывает адрес, но не меняет его: меняет только POST
    $this->getJson("/api/v1/email-changes/{$token}")->assertOk()->assertExactJson(['data' => ['email' => 'boris.new@selen.test']]);
    expect($this->user->fresh()->email)->toBe('boris@selen.test');

    $this->postJson("/api/v1/email-changes/{$token}/confirm")->assertOk()->assertExactJson(['data' => ['email' => 'boris.new@selen.test']]);

    expect($this->user->fresh()->email)->toBe('boris.new@selen.test')
        ->and(EmailChangeRequest::query()->count())->toBe(0)
        ->and(DB::table('password_reset_tokens')->where('email', 'boris@selen.test')->count())->toBe(0);
    $session->get('/api/v1/auth/me')->assertUnauthorized();
    Notification::assertSentTo(new AnonymousNotifiable, EmailChangedNotification::class,
        fn (EmailChangedNotification $n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'boris@selen.test' && $n->maskedEmail === 'b***@selen.test');

    browser('10.0.0.3')->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertUnprocessable();
    browser('10.0.0.4')->post('/api/v1/auth/login', ['email' => 'boris.new@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();

    // Событие «о человеке» без адресов; IP того, кто перешёл по ссылке, — в auth_audit
    $event = EventLogEntry::query()->where('event_type', 'auth.email_changed')->sole();
    expect($event->company_id)->toBeNull()
        ->and($event->actor_id)->toBeNull()
        ->and($event->subject_id)->toBe($this->user->id)
        ->and($event->payload)->toEqual(['requested_by_id' => $this->admin->id])
        ->and(AuthAuditEntry::query()->where('event_log_id', $event->id)->sole()->user_id)->toBe($this->user->id);
    expectNoPersonalDataInEventLog();

    // Ссылка — одноразовая
    $this->postJson("/api/v1/email-changes/{$token}/confirm")->assertUnprocessable()->assertJsonValidationErrors('token');
});

it('ссылка: неизвестная, просроченная, заменённая новым запросом и отменённая — 422 одним текстом', function () {
    $this->getJson('/api/v1/email-changes/'.str_repeat('x', 64))->assertUnprocessable()
        ->assertJsonPath('errors.token.0', __('selen.email_change.link_invalid'));

    $first = requestEmailChange($this, $this->admin, $this->user, 'first@selen.test');
    $second = requestEmailChange($this, $this->admin, $this->user, 'second@selen.test');
    $this->postJson("/api/v1/email-changes/{$first}/confirm")->assertUnprocessable();
    expect(EmailChangeRequest::query()->sole()->new_email)->toBe('second@selen.test');

    $this->travel(73)->hours();
    $this->postJson("/api/v1/email-changes/{$second}/confirm")->assertUnprocessable()
        ->assertJsonPath('errors.token.0', __('selen.email_change.link_invalid'));
    expect($this->user->fresh()->email)->toBe('boris@selen.test');
});

it('отмена: ссылка перестаёт работать, событие в журнале; отменять нечего — 422', function () {
    $token = requestEmailChange($this, $this->admin, $this->user, 'boris.new@selen.test');

    $this->actingAs($this->admin)->deleteJson(adminPath()."users/{$this->user->id}/email-change")->assertOk()
        ->assertJsonPath('data.email_change', null);
    $this->postJson("/api/v1/email-changes/{$token}/confirm")->assertUnprocessable();
    expect($this->user->fresh()->email)->toBe('boris@selen.test')
        ->and(loggedEventTypes())->toBe(['user.email_change_requested', 'user.email_change_cancelled']);

    $this->actingAs($this->admin)->deleteJson(adminPath()."users/{$this->user->id}/email-change")->assertUnprocessable();
});

it('новый email: занятый учётной записью или чужим запросом, нынешний, неверный — 422; ещё не принявший приглашение — 422', function () {
    member(['email' => 'taken@selen.test']);
    $other = member();
    requestEmailChange($this, $this->admin, $other, 'pending@selen.test');
    $url = adminPath()."users/{$this->user->id}/email-change";
    $this->actingAs($this->admin);

    $this->postJson($url, ['email' => 'TAKEN@selen.test'])->assertUnprocessable()->assertJsonPath('errors.email.0', __('selen.email_change.taken'));
    $this->postJson($url, ['email' => 'pending@selen.test'])->assertUnprocessable()->assertJsonPath('errors.email.0', __('selen.email_change.taken'));
    $this->postJson($url, ['email' => 'boris@selen.test'])->assertUnprocessable()->assertJsonPath('errors.email.0', __('selen.email_change.same'));
    $this->postJson($url, ['email' => 'не адрес'])->assertUnprocessable()->assertJsonValidationErrors('email');
    $this->postJson($url, [])->assertUnprocessable()->assertJsonValidationErrors('email');

    $invited = User::factory()->invited()->create();
    $this->postJson(adminPath()."users/{$invited->id}/email-change", ['email' => 'new@selen.test'])->assertUnprocessable()
        ->assertJsonPath('errors.email.0', __('selen.email_change.invited'));
});

it('адрес заняли, пока ссылка ждала, — 422, email прежний', function () {
    $token = requestEmailChange($this, $this->admin, $this->user, 'boris.new@selen.test');
    // Приглашение на тот же адрес (в обход проверки — такой гонки в интерфейсе не бывает)
    DB::table('email_change_requests')->delete();
    member(['email' => 'boris.new@selen.test']);
    DB::table('email_change_requests')->insert([
        'user_id' => $this->user->id, 'new_email' => 'boris.new@selen.test', 'token_hash' => EmailChangeRequest::hashToken($token),
        'requested_by_id' => $this->admin->id, 'expires_at' => now()->addHour(), 'created_at' => now(),
    ]);

    $this->postJson("/api/v1/email-changes/{$token}/confirm")->assertUnprocessable()
        ->assertJsonPath('errors.token.0', __('selen.email_change.link_taken'));
    expect($this->user->fresh()->email)->toBe('boris@selen.test');
});

it('права: Владельцем никто, администратором — только Владелец, себя — нет, участник — 403, участник с правом — можно', function () {
    $owner = owner();
    $otherAdmin = admin();
    $url = fn (User $user) => adminPath()."users/{$user->id}/email-change";
    $body = ['email' => 'new@selen.test'];

    $this->actingAs($this->admin)->postJson($url($owner), $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson($url($otherAdmin), $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson($url($this->admin), $body)->assertForbidden();
    $this->actingAs($owner)->postJson($url($owner), $body)->assertForbidden();
    $this->actingAs(member())->postJson($url($this->user), $body)->assertForbidden();
    $this->actingAs($this->admin)->deleteJson($url($otherAdmin))->assertForbidden();
    $this->actingAs($owner)->postJson($url($otherAdmin), $body)->assertOk();

    $granted = member();
    CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $granted->id, 'permission' => Permission::CompanyManageUsers]);
    $this->actingAs($granted)->postJson($url($this->user), ['email' => 'other@selen.test'])->assertOk();
    expect(EmailChangeRequest::query()->count())->toBe(2);
});

it('сотрудник двух компаний — только Владелец; гостя и убранного из компании — нельзя (решение PM 28.10, п. 8)', function () {
    $other = otherCompany();
    $this->user->companies()->attach($other->id, ['kind' => 'home']);
    $guest = User::factory()->inCompany($other)->guestIn(company())->create();
    $removed = member();
    $removed->companies()->updateExistingPivot(company()->id, ['deactivated_at' => now()]);
    $removed->companies()->attach($other->id, ['kind' => 'home']);
    $body = ['email' => 'new@selen.test'];

    $this->actingAs($this->admin)->postJson(adminPath()."users/{$this->user->id}/email-change", $body)->assertForbidden();
    $this->actingAs(admin(company: $other))->postJson(adminPath($other)."users/{$this->user->id}/email-change", $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$guest->id}/email-change", $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$removed->id}/email-change", $body)->assertForbidden();

    $rows = collect($this->actingAs($this->admin)->getJson(adminPath().'users')->json('data'))->keyBy('id');
    expect($rows[$this->user->id]['permissions']['change_email'])->toBeFalse()
        ->and($rows[$this->user->id]['permissions']['terminate_sessions'])->toBeTrue();

    $this->actingAs(owner())->postJson(adminPath()."users/{$this->user->id}/email-change", $body)->assertOk();
});

it('ссылка не подходит, если человек тем временем стал Владельцем (им не управляет никто)', function () {
    $owner = owner();
    $token = requestEmailChange($this, $this->admin, $this->user, 'boris.new@selen.test');
    DB::table('users')->where('id', $owner->id)->update(['role' => 'member']);
    DB::table('users')->where('id', $this->user->id)->update(['role' => 'owner']);

    $this->postJson("/api/v1/email-changes/{$token}/confirm")->assertUnprocessable();
    expect($this->user->fresh()->email)->toBe('boris@selen.test');
});

it('в списке «Пользователей» новый адрес видят только те, кто может менять email; просроченные запросы удаляет планировщик', function () {
    $owner = owner();
    $otherAdmin = admin();
    requestEmailChange($this, $owner, $otherAdmin, 'admin.new@selen.test');

    $row = fn (User $viewer) => collect($this->actingAs($viewer)->getJson(adminPath().'users')->json('data'))->firstWhere('id', $otherAdmin->id);
    expect($row($owner)['email_change']['email'])->toBe('admin.new@selen.test')
        ->and($row($this->admin)['email_change'])->toBeNull();

    $this->travel(73)->hours();
    $this->artisan('model:prune', ['--model' => [EmailChangeRequest::class]])->assertSuccessful();
    expect(EmailChangeRequest::query()->count())->toBe(0);
});

it('лимит запросов смены email — 10 в минуту на автора', function () {
    $this->actingAs($this->admin);
    foreach (range(1, 10) as $i) {
        $this->postJson(adminPath()."users/{$this->user->id}/email-change", ['email' => "new{$i}@selen.test"])->assertOk();
    }
    $this->postJson(adminPath()."users/{$this->user->id}/email-change", ['email' => 'new11@selen.test'])->assertTooManyRequests();
});
