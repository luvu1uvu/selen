<?php

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\EventLogEntry;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationNotification;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('создаёт приглашённого пользователя, приглашение и отправляет письмо', function () {
    $admin = admin();

    $this->actingAs($admin)->postJson(adminPath().'invitations', [
        'name' => '  Борис Новиков ',
        'email' => ' Boris@Selen.TEST ',
        'role' => 'member',
    ])
        ->assertCreated()
        ->assertJsonPath('data.email', 'boris@selen.test')
        ->assertJsonPath('data.name', 'Борис Новиков')
        ->assertJsonPath('data.state', 'pending')
        ->assertJsonPath('data.invited_by.id', $admin->id)
        ->assertJsonPath('data.can_revoke', true)
        ->assertJsonMissingPath('data.token_hash');

    $user = User::query()->where('email', 'boris@selen.test')->sole();
    expect($user)
        ->status->toBe(UserStatus::Invited)
        ->role->toBe(UserRole::Member)
        ->password->toBeNull()
        ->timezone->toBe('Europe/Moscow');

    $invitation = Invitation::query()->sole();
    $token = null;
    Notification::assertSentTo($user, InvitationNotification::class, function (InvitationNotification $n) use (&$token) {
        $token = $n->token;

        return true;
    });

    // В БД — только хеш токена, сам токен не хранится
    expect($invitation->token_hash)->toBe(hash('sha256', $token))
        ->and(Invitation::query()->where('token_hash', $token)->exists())->toBeFalse()
        ->and($invitation->expires_at->diffInHours(now(), true))->toEqualWithDelta(72, 0.1);

    $event = EventLogEntry::query()->sole();
    expect($event->event_type)->toBe('user.invited')
        ->and($event->actor_id)->toBe($admin->id)
        ->and($event->subject_type)->toBe('user')
        ->and($event->payload['invitation_id'])->toBe($invitation->id);
});

it('формирует письмо-приглашение на русском без пароля', function () {
    $this->actingAs(owner())->postJson(adminPath().'invitations', [
        'name' => 'Борис', 'email' => 'boris@selen.test', 'role' => 'admin',
    ])->assertCreated();

    $user = User::query()->where('email', 'boris@selen.test')->sole();
    Notification::assertSentTo($user, InvitationNotification::class, function (InvitationNotification $n) use ($user) {
        $mail = $n->toMail($user);
        $rendered = (string) $mail->render();

        return $mail->subject === 'Приглашение в Selen'
            && $mail->actionUrl === 'http://localhost/invitations/'.$n->token
            && str_contains($rendered, 'Здравствуйте, Борис!')
            && ! str_contains(mb_strtolower($rendered), 'ваш пароль');
    });
});

it('отправляет письмо через очередь', function () {
    expect(new InvitationNotification(Invitation::factory()->make(), 'token'))
        ->toBeInstanceOf(ShouldQueue::class)
        ->toBeInstanceOf(ShouldBeEncrypted::class);
});

it('не приглашает существующий email: один ответ — и для своей компании, и для другой (решение PM 26.10)', function () {
    member(['email' => 'boris@selen.test']);
    member(['email' => 'vera@selen.test'], otherCompany(['name' => 'Компания 2']));
    $this->actingAs(admin());

    $answers = collect(['BORIS@selen.test', 'vera@selen.test'])->map(fn (string $email) => $this->postJson(adminPath().'invitations', [
        'name' => 'Кто-то', 'email' => $email, 'role' => 'member',
    ])->assertUnprocessable()->json());

    expect($answers[0])->toBe($answers[1])
        ->and($answers[0]['errors']['email'][0])->toBe('Этот email уже используется в Selen.')
        ->and(json_encode($answers[0], JSON_UNESCAPED_UNICODE))->not->toContain('компан');
    Notification::assertNothingSent();
});

it('лимит приглашений: 10 в минуту на приглашающего, отказы тоже считаются; другой администратор — свой счётчик', function () {
    $admin = admin();
    $this->actingAs($admin);
    $invite = fn (string $email) => $this->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => $email, 'role' => 'member']);

    foreach (range(1, 9) as $i) {
        $invite("new{$i}@selen.test")->assertCreated();
    }
    $invite('new1@selen.test')->assertUnprocessable(); // занятый email — тоже попытка

    $invite('new10@selen.test')->assertTooManyRequests()
        ->assertJsonPath('message', 'Слишком много приглашений: не больше 10 в минуту и 300 в сутки. Продолжить можно через 1 мин.');
    // «Отправить повторно» — та же отправка письма, тот же лимит
    $this->postJson(adminPath().'invitations/'.Invitation::query()->firstOrFail()->id.'/resend')->assertTooManyRequests();
    $this->actingAs(admin())->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'other@selen.test', 'role' => 'member'])->assertCreated();

    $this->travel(61)->seconds();
    $this->actingAs($admin);
    $invite('new10@selen.test')->assertCreated();
    expect(User::query()->where('email', 'like', 'new%')->count())->toBe(10);
});

it('лимит приглашений: 300 в сутки на приглашающего — дальше ждать до конца суток', function () {
    $this->actingAs(admin());
    $attempt = fn () => $this->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'не-email', 'role' => 'member']);

    // Неверный email — отказ, но попытка считается; по 10 в минуту
    foreach (range(1, 30) as $minute) {
        foreach (range(1, 10) as $i) {
            $attempt()->assertUnprocessable();
        }
        $this->travel(61)->seconds();
    }

    $attempt()->assertTooManyRequests()
        ->assertJsonPath('message', fn (string $message) => preg_match('/Продолжить можно через \d+ ч \d+ мин\.$/u', $message) === 1);
});

it('валидирует данные приглашения', function () {
    $this->actingAs(admin())->postJson(adminPath().'invitations', ['email' => 'nope', 'role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name', 'email', 'role']);
});

it('не даёт участнику приглашать', function () {
    $this->actingAs(member())->postJson(adminPath().'invitations', [
        'name' => 'Борис', 'email' => 'boris@selen.test', 'role' => 'member',
    ])->assertForbidden();

    expect(User::query()->where('email', 'boris@selen.test')->exists())->toBeFalse();
});
