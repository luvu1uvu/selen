<?php

use App\Actions\Invitations\ResendInvitationAction;
use App\Actions\Invitations\RevokeInvitationAction;
use App\Actions\Users\ChangeUserRoleAction;
use App\Actions\Users\DeactivateUserAction;
use App\Actions\Users\TransferOwnershipAction;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/*
| Роль «Владелец» (ADR-0017). Основной механизм — политики и Actions: любая попытка понизить, деактивировать
| или снять Владельца через API — 403 или 422, никогда 500. Ограничения БД — страховка (проверяются отдельно).
*/

beforeEach(function () {
    $this->owner = owner();
    $this->admin = admin();
});

it('попытки понизить, деактивировать или изменить Владельца через API — 403/422, роль и статус не меняются', function (string $actor, string $method, string $path, array $body, int $status) {
    $user = $actor === 'owner' ? $this->owner : $this->admin;

    $this->actingAs($user)
        ->json($method, '/api/v1/'.strtr($path, ['{owner}' => $this->owner->id, '{admin}' => $this->admin->id]), $body)
        ->assertStatus($status);

    expect($this->owner->fresh())
        ->role->toBe(UserRole::Owner)
        ->status->toBe(UserStatus::Active);
})->with([
    'админ понижает Владельца' => ['admin', 'PATCH', 'admin/users/{owner}/role', ['role' => 'member'], 403],
    'админ «повышает» Владельца до админа' => ['admin', 'PATCH', 'admin/users/{owner}/role', ['role' => 'admin'], 403],
    'админ деактивирует Владельца' => ['admin', 'POST', 'admin/users/{owner}/deactivate', [], 403],
    'админ «восстанавливает» Владельца' => ['admin', 'POST', 'admin/users/{owner}/reactivate', [], 403],
    'админ забирает владение себе' => ['admin', 'POST', 'admin/users/{admin}/transfer-ownership', ['password' => 'password-123'], 403],
    'админ «передаёт» владение Владельцу' => ['admin', 'POST', 'admin/users/{owner}/transfer-ownership', ['password' => 'password-123'], 403],
    'Владелец понижает себя' => ['owner', 'PATCH', 'admin/users/{owner}/role', ['role' => 'member'], 403],
    'Владелец деактивирует себя' => ['owner', 'POST', 'admin/users/{owner}/deactivate', [], 403],
    'Владелец передаёт владение себе' => ['owner', 'POST', 'admin/users/{owner}/transfer-ownership', ['password' => 'password-123'], 403],
]);

it('роль Владельца не назначается сменой роли и приглашением — 422', function () {
    $member = member();

    $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$member->id}/role", ['role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
    $this->actingAs($this->owner)->postJson('/api/v1/admin/invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
    $this->actingAs($this->admin)->postJson('/api/v1/admin/invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'owner'])
        ->assertUnprocessable();

    expect($member->fresh()->role)->toBe(UserRole::Member)
        ->and(User::query()->where('role', UserRole::Owner)->pluck('id')->all())->toBe([$this->owner->id]);
});

it('роль в приглашении не строкой — 403 участнику, 422 администратору, не 500', function () {
    $body = ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => ['admin']];

    $this->actingAs(member())->postJson('/api/v1/admin/invitations', $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson('/api/v1/admin/invitations', $body)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
});

it('роль сменилась, пока ждали блокировку, — 422 «обновите страницу», ничего не меняется', function () {
    // Политика пустила по прежним ролям: участника тем временем назначили администратором
    $target = member();
    User::query()->whereKey($target->id)->update(['role' => UserRole::Admin]);
    expect(fn () => app(DeactivateUserAction::class)->handle($this->admin, $target))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));
    expect($target->fresh()->status)->toBe(UserStatus::Active);

    // Приглашение: приглашённого тем временем сделали администратором
    $invitation = Invitation::factory()->create();
    $invitation->user;   // политика уже прочитала его роль
    User::query()->whereKey($invitation->user_id)->update(['role' => UserRole::Admin]);
    expect(fn () => app(ResendInvitationAction::class)->handle($this->admin, $invitation))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'))
        ->and(fn () => app(RevokeInvitationAction::class)->handle($this->admin, $invitation))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));

    // Автор: Владелец передал владение, а запрос на смену роли пришёл следом со старой ролью
    $next = member();
    app(TransferOwnershipAction::class)->handle($this->owner, $next, 'admin_panel');
    $member = member();
    expect(fn () => app(ChangeUserRoleAction::class)->handle($this->owner, $member, UserRole::Admin))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));
    expect($member->fresh()->role)->toBe(UserRole::Member);
});

it('приглашение Владельца (принятое) не повторить и не отозвать', function () {
    $invitation = Invitation::factory()->create(['user_id' => $this->owner->id, 'email' => $this->owner->email, 'accepted_at' => now()]);

    foreach ([$this->owner, $this->admin] as $actor) {
        $this->actingAs($actor)->postJson("/api/v1/admin/invitations/{$invitation->id}/resend")->assertForbidden();
        $this->actingAs($actor)->postJson("/api/v1/admin/invitations/{$invitation->id}/revoke")->assertForbidden();
    }
});

it('Actions сами не дают снять или деактивировать Владельца — 422 (страховка вне HTTP)', function () {
    expect(fn () => app(ChangeUserRoleAction::class)->handle($this->admin, $this->owner, UserRole::Admin))
        ->toThrow(ValidationException::class, __('selen.users.owner_role_by_transfer'))
        ->and(fn () => app(ChangeUserRoleAction::class)->handle($this->owner, $this->admin, UserRole::Owner))
        ->toThrow(ValidationException::class, __('selen.users.owner_role_by_transfer'))
        ->and(fn () => app(DeactivateUserAction::class)->handle($this->admin, $this->owner))
        ->toThrow(ValidationException::class, __('selen.users.owner_not_deactivated'));

    expect($this->owner->fresh()->role)->toBe(UserRole::Owner)
        ->and($this->admin->fresh()->role)->toBe(UserRole::Admin);
});

it('обычный админ управляет участниками, но не администраторами и не повышает себя', function () {
    $member = member();
    $otherAdmin = admin();

    $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$member->id}/deactivate")->assertOk();
    $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$member->id}/reactivate")->assertOk();
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/users/{$member->id}/role", ['role' => 'admin'])->assertForbidden();
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/users/{$otherAdmin->id}/role", ['role' => 'member'])->assertForbidden();
    $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$otherAdmin->id}/deactivate")->assertForbidden();
    $this->actingAs($this->admin)->patchJson("/api/v1/admin/users/{$this->admin->id}/role", ['role' => 'admin'])->assertForbidden();
    $this->actingAs($this->admin)->postJson('/api/v1/admin/invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'admin'])->assertForbidden();

    expect($member->fresh()->role)->toBe(UserRole::Member)
        ->and($otherAdmin->fresh())->role->toBe(UserRole::Admin)->status->toBe(UserStatus::Active)
        ->and(User::query()->where('email', 'new@selen.test')->exists())->toBeFalse();
});

it('Владелец назначает и снимает администратора, деактивирует и восстанавливает его', function () {
    $member = member();

    $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$member->id}/role", ['role' => 'admin'])
        ->assertOk()->assertJsonPath('data.role', 'admin');
    $this->actingAs($this->owner)->postJson("/api/v1/admin/users/{$member->id}/deactivate")->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/admin/users/{$member->id}/reactivate")->assertOk();
    $this->actingAs($this->owner)->patchJson("/api/v1/admin/users/{$member->id}/role", ['role' => 'member'])
        ->assertOk()->assertJsonPath('data.role', 'member');

    expect(loggedEventTypes())->toBe(['user.role_changed', 'user.deactivated', 'user.reactivated', 'user.role_changed']);
});

it('список пользователей подсказывает интерфейсу доступные действия', function () {
    $member = member(['name' => 'Борис']);

    $rows = fn (User $actor) => collect($this->actingAs($actor)->getJson('/api/v1/admin/users')->assertOk()->json('data'))
        ->keyBy('id')->map(fn (array $row) => $row['permissions']);

    $asOwner = $rows($this->owner);
    expect($asOwner[$member->id])->toBe(['update_role' => true, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => true])
        ->and($asOwner[$this->admin->id])->toBe(['update_role' => true, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => true])
        ->and($asOwner[$this->owner->id])->toBe(['update_role' => false, 'deactivate' => false, 'reactivate' => false, 'manage_invitation' => false, 'transfer_ownership' => false]);

    $asAdmin = $rows($this->admin);
    expect($asAdmin[$member->id])->toBe(['update_role' => false, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => false])
        ->and($asAdmin[$this->owner->id])->each->toBeFalse()
        ->and($asAdmin[$this->admin->id])->each->toBeFalse();
});

it('приглашение администратора ведёт только Владелец: подсказки can_resend / can_revoke', function () {
    $invitation = Invitation::factory()->create(['user_id' => User::factory()->admin()->invited()]);

    $this->actingAs($this->admin)->getJson('/api/v1/admin/invitations')->assertOk()
        ->assertJsonPath('data.0.can_resend', false)
        ->assertJsonPath('data.0.can_revoke', false);
    $this->actingAs($this->owner)->getJson('/api/v1/admin/invitations')->assertOk()
        ->assertJsonPath('data.0.id', $invitation->id)
        ->assertJsonPath('data.0.can_resend', true)
        ->assertJsonPath('data.0.can_revoke', true);
});

it('аналитика трудозатрат (этап 9) — только Владельцу', function () {
    expect(Gate::forUser($this->owner)->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS))->toBeTrue()
        ->and(Gate::forUser($this->admin)->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS))->toBeFalse()
        ->and(Gate::forUser(member())->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS))->toBeFalse();
});

describe('ограничения БД (страховка)', function () {
    it('второго Владельца не бывает', function () {
        expect(fn () => DB::transaction(fn () => owner()))->toThrow(QueryException::class, 'users_single_owner')
            ->and(fn () => DB::transaction(fn () => $this->admin->forceFill(['role' => UserRole::Owner])->save()))
            ->toThrow(QueryException::class, 'users_single_owner');
    });

    it('Владелец всегда активен', function () {
        expect(fn () => DB::transaction(fn () => $this->owner->forceFill(['status' => UserStatus::Deactivated])->save()))
            ->toThrow(QueryException::class, 'users_owner_active');
    });

    it('роль Владельца не снимается без нового Владельца в той же транзакции', function () {
        // Триггер отложенный (проверка при COMMIT); транзакция теста не фиксируется — проверяем сразу
        DB::statement('SET CONSTRAINTS users_owner_kept IMMEDIATE');

        expect(fn () => DB::transaction(fn () => $this->owner->forceFill(['role' => UserRole::Admin])->save()))
            ->toThrow(QueryException::class, 'the owner role can only be handed over');
    });

    it('передача — смена двух строк в одной транзакции — проходит проверку', function () {
        DB::statement('SET CONSTRAINTS users_owner_kept DEFERRED');
        DB::transaction(function () {
            $this->owner->forceFill(['role' => UserRole::Admin])->save();
            $this->admin->forceFill(['role' => UserRole::Owner])->save();
        });
        DB::statement('SET CONSTRAINTS users_owner_kept IMMEDIATE');

        expect($this->admin->fresh()->role)->toBe(UserRole::Owner);
    });
});
