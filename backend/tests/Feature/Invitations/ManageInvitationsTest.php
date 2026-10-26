<?php

use App\Enums\UserStatus;
use App\Models\Invitation;
use App\Notifications\InvitationNotification;
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

it('повторная отправка выпускает новую ссылку, а старая перестаёт работать', function () {
    $admin = admin();
    $old = Invitation::factory()->withToken('old-token')->create();

    // 201: выпущено новое приглашение
    $response = $this->actingAs($admin)->postJson(adminPath()."invitations/{$old->id}/resend")->assertCreated()
        ->assertJsonPath('data.state', 'pending')
        ->assertJsonPath('data.can_resend', true);

    $new = Invitation::query()->findOrFail($response->json('data.id'));
    expect($new->id)->not->toBe($old->id)
        ->and($old->fresh()->superseded_by_id)->toBe($new->id)
        ->and($old->fresh()->state()->value)->toBe('superseded');

    Notification::assertSentTo($old->user, InvitationNotification::class, fn ($n) => $n->invitation->is($new));
    $this->getJson('/api/v1/invitations/old-token')->assertStatus(410)->assertJsonPath('code', 'invitation_superseded');

    expect(loggedEventTypes())->toBe(['invitation.resent']);
});

it('повторно отправляет истёкшее приглашение', function () {
    $old = Invitation::factory()->expired()->create();

    $this->actingAs(admin())->postJson(adminPath()."invitations/{$old->id}/resend")->assertCreated()
        ->assertJsonPath('data.state', 'pending');
});

it('отзыв закрывает ссылку и переводит пользователя в деактивированные', function () {
    $invitation = Invitation::factory()->withToken('token')->create();

    $this->actingAs(admin())->postJson(adminPath()."invitations/{$invitation->id}/revoke")
        ->assertOk()
        ->assertJsonPath('data.state', 'revoked')
        ->assertJsonPath('data.can_revoke', false)
        ->assertJsonPath('data.can_resend', true);

    expect($invitation->user->fresh()->status)->toBe(UserStatus::Deactivated)
        ->and(loggedEventTypes())->toBe(['invitation.revoked']);
    $this->getJson('/api/v1/invitations/token')->assertStatus(410)->assertJsonPath('code', 'invitation_revoked');
});

it('отозванное приглашение можно отправить заново — пользователь снова приглашён', function () {
    $invitation = Invitation::factory()->create();
    $admin = admin();
    $this->actingAs($admin)->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertOk();

    $this->actingAs($admin)->postJson(adminPath()."invitations/{$invitation->id}/resend")->assertCreated();

    expect($invitation->user->fresh())->status->toBe(UserStatus::Invited)->deactivated_at->toBeNull();
});

it('в списке пользователей отозванное приглашение отличается от деактивации', function () {
    $admin = admin();
    $invitation = Invitation::factory()->create();
    $this->actingAs($admin)->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertOk();
    $gone = member(['status' => UserStatus::Deactivated]);

    $users = collect($this->actingAs($admin)->getJson(adminPath().'users?status=deactivated')->assertOk()->json('data'))
        ->keyBy('id');

    expect($users[$invitation->user_id]['invitation']['state'])->toBe('revoked')
        ->and($users[$gone->id]['invitation'])->toBeNull();
});

it('не отзывает принятое приглашение и не отправляет его повторно', function () {
    $invitation = Invitation::factory()->create(['accepted_at' => now()]);
    $invitation->user->forceFill(['status' => UserStatus::Active, 'password' => 'some-password-1'])->save();
    $admin = admin();

    $this->actingAs($admin)->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertUnprocessable();
    $this->actingAs($admin)->postJson(adminPath()."invitations/{$invitation->id}/resend")->assertUnprocessable();
});

it('не отправляет повторно устаревшее (не последнее) приглашение', function () {
    $old = Invitation::factory()->create();
    $admin = admin();
    $this->actingAs($admin)->postJson(adminPath()."invitations/{$old->id}/resend")->assertCreated();

    $this->actingAs($admin)->postJson(adminPath()."invitations/{$old->id}/resend")->assertUnprocessable();
});

it('показывает список приглашений с состояниями, включая истёкшие', function () {
    Invitation::factory()->create();
    Invitation::factory()->expired()->create();

    $this->actingAs(admin())->getJson(adminPath().'invitations')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.total', 2)
        ->assertJsonFragment(['state' => 'expired'])
        ->assertJsonFragment(['state' => 'pending']);
});

it('закрывает управление приглашениями от участников', function () {
    $invitation = Invitation::factory()->create();
    $this->actingAs(member());

    $this->getJson(adminPath().'invitations')->assertForbidden();
    $this->postJson(adminPath()."invitations/{$invitation->id}/resend")->assertForbidden();
    $this->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertForbidden();
});
