<?php

use App\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

function pendingInvitation(string $token = 'secret-token'): Invitation
{
    return Invitation::factory()->withToken($token)->create();
}

it('показывает данные действующего приглашения', function () {
    $invitation = pendingInvitation();

    $this->getJson('/api/v1/invitations/secret-token')
        ->assertOk()
        ->assertJsonPath('data.email', $invitation->email)
        ->assertJsonPath('data.name', $invitation->user->name)
        ->assertJsonStructure(['data' => ['name', 'email', 'expires_at']]);
});

it('возвращает 404 с кодом для неизвестного токена', function () {
    $this->getJson('/api/v1/invitations/unknown')
        ->assertNotFound()
        ->assertJsonPath('code', 'invitation_invalid');
});

it('сообщает об истёкшем приглашении', function () {
    Invitation::factory()->withToken('old')->expired()->create();

    $this->getJson('/api/v1/invitations/old')->assertStatus(410)->assertJsonPath('code', 'invitation_expired');
    $this->postJson('/api/v1/invitations/old/accept', [
        'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
    ])->assertStatus(410)->assertJsonPath('code', 'invitation_expired');
});

it('сообщает об отозванном приглашении', function () {
    $invitation = pendingInvitation();
    $invitation->forceFill(['revoked_at' => now()])->save();
    $invitation->user->forceFill(['status' => UserStatus::Deactivated])->save();

    $this->getJson('/api/v1/invitations/secret-token')->assertStatus(410)->assertJsonPath('code', 'invitation_revoked');
});

it('принимает приглашение: задаёт пароль, активирует и выполняет вход', function () {
    $invitation = pendingInvitation();
    $browser = browser();

    $browser->post('/api/v1/invitations/secret-token/accept', [
        'password' => 'my-new-password',
        'password_confirmation' => 'my-new-password',
    ])->assertOk()->assertJsonPath('data.status', 'active');

    $user = $invitation->user->fresh();
    expect($user->status)->toBe(UserStatus::Active)
        ->and(Hash::check('my-new-password', $user->password))->toBeTrue()
        ->and($user->last_login_at)->not->toBeNull()
        ->and($invitation->fresh()->accepted_at)->not->toBeNull()
        ->and(loggedEventTypes())->toBe(['invitation.accepted', 'auth.login_succeeded']);

    $browser->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.id', $user->id);
});

it('не позволяет принять приглашение дважды', function () {
    pendingInvitation();
    $payload = ['password' => 'my-new-password', 'password_confirmation' => 'my-new-password'];

    $this->postJson('/api/v1/invitations/secret-token/accept', $payload)->assertOk();
    $this->postJson('/api/v1/invitations/secret-token/accept', $payload)
        ->assertStatus(410)
        ->assertJsonPath('code', 'invitation_used');
});

it('требует надёжный пароль с подтверждением', function () {
    pendingInvitation();

    $this->postJson('/api/v1/invitations/secret-token/accept', [
        'password' => 'short', 'password_confirmation' => 'different',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');

    expect(User::query()->where('status', UserStatus::Active)->exists())->toBeFalse();
});

it('ограничивает перебор токенов приглашений', function () {
    foreach (range(1, 20) as $attempt) {
        $this->getJson("/api/v1/invitations/guess-{$attempt}")->assertNotFound();
    }

    $this->getJson('/api/v1/invitations/guess-21')->assertTooManyRequests();
});
