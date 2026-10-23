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

it('не приглашает существующий email', function () {
    member(['email' => 'boris@selen.test']);

    $this->actingAs(admin())->postJson(adminPath().'invitations', [
        'name' => 'Борис', 'email' => 'BORIS@selen.test', 'role' => 'member',
    ])->assertUnprocessable()->assertJsonPath('errors.email.0', __('selen.invitations.email_taken'));

    Notification::assertNothingSent();
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
