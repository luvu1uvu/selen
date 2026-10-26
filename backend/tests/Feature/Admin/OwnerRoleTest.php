<?php

use App\Actions\Invitations\ResendInvitationAction;
use App\Actions\Invitations\RevokeInvitationAction;
use App\Actions\Users\ChangeUserRoleAction;
use App\Actions\Users\DeactivateUserAction;
use App\Actions\Users\TransferOwnershipAction;
use App\Enums\CompanyRole;
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
        ->json($method, adminPath().strtr($path, ['{owner}' => $this->owner->id, '{admin}' => $this->admin->id]), $body)
        ->assertStatus($status);

    expect($this->owner->fresh())
        ->role->toBe(UserRole::Owner)
        ->status->toBe(UserStatus::Active);
})->with([
    'админ понижает Владельца' => ['admin', 'PATCH', 'users/{owner}/role', ['role' => 'member'], 403],
    'админ «повышает» Владельца до админа' => ['admin', 'PATCH', 'users/{owner}/role', ['role' => 'admin'], 403],
    'админ деактивирует Владельца' => ['admin', 'POST', 'users/{owner}/deactivate', [], 403],
    'админ «восстанавливает» Владельца' => ['admin', 'POST', 'users/{owner}/reactivate', [], 403],
    'админ забирает владение себе' => ['admin', 'POST', 'users/{admin}/transfer-ownership', ['password' => 'password-123'], 403],
    'админ «передаёт» владение Владельцу' => ['admin', 'POST', 'users/{owner}/transfer-ownership', ['password' => 'password-123'], 403],
    'Владелец понижает себя' => ['owner', 'PATCH', 'users/{owner}/role', ['role' => 'member'], 403],
    'Владелец деактивирует себя' => ['owner', 'POST', 'users/{owner}/deactivate', [], 403],
    'Владелец передаёт владение себе' => ['owner', 'POST', 'users/{owner}/transfer-ownership', ['password' => 'password-123'], 403],
]);

it('роль Владельца не назначается сменой роли и приглашением — 422', function () {
    $member = member();

    $this->actingAs($this->owner)->patchJson(adminPath()."users/{$member->id}/role", ['role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
    $this->actingAs($this->owner)->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'owner'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
    $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'owner'])
        ->assertUnprocessable();

    expect($member->fresh()->role)->toBe(UserRole::Member)
        ->and(User::query()->where('role', UserRole::Owner)->pluck('id')->all())->toBe([$this->owner->id]);
});

it('роль в приглашении не строкой — 403 участнику, 422 администратору, не 500', function () {
    $body = ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => ['admin']];

    $this->actingAs(member())->postJson(adminPath().'invitations', $body)->assertForbidden();
    $this->actingAs($this->admin)->postJson(adminPath().'invitations', $body)
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');
});

it('роль сменилась, пока ждали блокировку, — 422 «обновите страницу», ничего не меняется', function () {
    // Политика пустила по прежним ролям: участника тем временем назначили администратором компании
    $company = company();
    $target = member();
    $company->permissionsOf($target);   // политика уже прочитала его права в компании
    company()->users()->updateExistingPivot($target->id, ['is_admin' => true]);
    expect(fn () => app(DeactivateUserAction::class)->handle($this->admin, $target, $company))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));
    expect($target->fresh()->status)->toBe(UserStatus::Active);

    // Приглашение: приглашённого тем временем сделали администратором компании
    $invitation = Invitation::factory()->create();
    $company->permissionsOf($invitation->user);   // политика уже прочитала его роль
    company()->users()->updateExistingPivot($invitation->user_id, ['is_admin' => true]);
    expect(fn () => app(ResendInvitationAction::class)->handle($this->admin, $invitation, $company))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'))
        ->and(fn () => app(RevokeInvitationAction::class)->handle($this->admin, $invitation, $company))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));

    // Автор: Владелец передал владение, а запрос на смену роли пришёл следом со старой ролью
    $next = member();
    app(TransferOwnershipAction::class)->handle($this->owner, $next, 'admin_panel');
    $member = member();
    expect(fn () => app(ChangeUserRoleAction::class)->handle($this->owner, $member, company(), CompanyRole::Admin))
        ->toThrow(ValidationException::class, __('selen.users.roles_changed'));
    expect(company()->roleOf($member))->toBe('member');
});

it('приглашение Владельца (принятое) не повторить и не отозвать', function () {
    $invitation = Invitation::factory()->create(['user_id' => $this->owner->id, 'email' => $this->owner->email, 'accepted_at' => now()]);

    foreach ([$this->owner, $this->admin] as $actor) {
        $this->actingAs($actor)->postJson(adminPath()."invitations/{$invitation->id}/resend")->assertForbidden();
        $this->actingAs($actor)->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertForbidden();
    }
});

it('Actions сами не дают снять или деактивировать Владельца — 422 (страховка вне HTTP)', function () {
    // Назначить роль Owner сменой роли в компании нельзя и по типу: у CompanyRole её нет (API — 422, тест выше)
    expect(fn () => app(ChangeUserRoleAction::class)->handle($this->admin, $this->owner, company(), CompanyRole::Admin))
        ->toThrow(ValidationException::class, __('selen.users.owner_role_by_transfer'))
        ->and(fn () => app(ChangeUserRoleAction::class)->handle($this->owner, $this->owner, company(), CompanyRole::Member))
        ->toThrow(ValidationException::class, __('selen.users.owner_role_by_transfer'))
        ->and(fn () => app(DeactivateUserAction::class)->handle($this->admin, $this->owner, company()))
        ->toThrow(ValidationException::class, __('selen.users.owner_not_deactivated'));

    expect($this->owner->fresh()->role)->toBe(UserRole::Owner)
        ->and(company()->roleOf($this->admin))->toBe('admin');
});

it('обычный админ управляет участниками, но не администраторами и не повышает себя', function () {
    $member = member();
    $otherAdmin = admin();

    $this->actingAs($this->admin)->postJson(adminPath()."users/{$member->id}/deactivate")->assertOk();
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$member->id}/reactivate")->assertOk();
    $this->actingAs($this->admin)->patchJson(adminPath()."users/{$member->id}/role", ['role' => 'admin'])->assertForbidden();
    $this->actingAs($this->admin)->patchJson(adminPath()."users/{$otherAdmin->id}/role", ['role' => 'member'])->assertForbidden();
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$otherAdmin->id}/deactivate")->assertForbidden();
    $this->actingAs($this->admin)->patchJson(adminPath()."users/{$this->admin->id}/role", ['role' => 'admin'])->assertForbidden();
    $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'admin'])->assertForbidden();

    expect(company()->roleOf($member))->toBe('member')
        ->and(company()->roleOf($otherAdmin))->toBe('admin')
        ->and($otherAdmin->fresh()->status)->toBe(UserStatus::Active)
        ->and(User::query()->where('email', 'new@selen.test')->exists())->toBeFalse();
});

it('Владелец назначает и снимает администратора, деактивирует и восстанавливает его', function () {
    $member = member();

    $this->actingAs($this->owner)->patchJson(adminPath()."users/{$member->id}/role", ['role' => 'admin'])
        ->assertOk()->assertJsonPath('data.role', 'admin');
    $this->actingAs($this->owner)->postJson(adminPath()."users/{$member->id}/deactivate")->assertOk();
    $this->actingAs($this->owner)->postJson(adminPath()."users/{$member->id}/reactivate")->assertOk();
    $this->actingAs($this->owner)->patchJson(adminPath()."users/{$member->id}/role", ['role' => 'member'])
        ->assertOk()->assertJsonPath('data.role', 'member');

    expect(loggedEventTypes())->toBe(['user.role_changed', 'user.deactivated', 'user.reactivated', 'user.role_changed']);
});

it('список пользователей подсказывает интерфейсу доступные действия', function () {
    $member = member(['name' => 'Борис']);

    $rows = fn (User $actor) => collect($this->actingAs($actor)->getJson(adminPath().'users')->assertOk()->json('data'))
        ->keyBy('id')->map(fn (array $row) => $row['permissions']);

    $asOwner = $rows($this->owner);
    expect($asOwner[$member->id])->toBe(['update_role' => true, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => true, 'owner_only' => false])
        ->and($asOwner[$this->admin->id])->toBe(['update_role' => true, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => true, 'owner_only' => false])
        ->and($asOwner[$this->owner->id])->toBe(['update_role' => false, 'deactivate' => false, 'reactivate' => false, 'manage_invitation' => false, 'transfer_ownership' => false, 'owner_only' => false]);

    $asAdmin = $rows($this->admin);
    expect($asAdmin[$member->id])->toBe(['update_role' => false, 'deactivate' => true, 'reactivate' => true, 'manage_invitation' => true, 'transfer_ownership' => false, 'owner_only' => false])
        ->and($asAdmin[$this->owner->id])->each->toBeFalse()
        ->and($asAdmin[$this->admin->id])->each->toBeFalse();
});

it('приглашение администратора ведёт только Владелец: подсказки can_resend / can_revoke', function () {
    $invitation = Invitation::factory()->create(['user_id' => User::factory()->admin()->invited()]);

    $this->actingAs($this->admin)->getJson(adminPath().'invitations')->assertOk()
        ->assertJsonPath('data.0.can_resend', false)
        ->assertJsonPath('data.0.can_revoke', false);
    $this->actingAs($this->owner)->getJson(adminPath().'invitations')->assertOk()
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

        expect(fn () => DB::transaction(fn () => $this->owner->forceFill(['role' => UserRole::Member])->save()))
            ->toThrow(QueryException::class, 'the owner role can only be handed over');
    });

    it('передача — смена двух строк в одной транзакции — проходит проверку', function () {
        DB::statement('SET CONSTRAINTS users_owner_kept DEFERRED');
        DB::transaction(function () {
            $this->owner->forceFill(['role' => UserRole::Member])->save();
            $this->admin->forceFill(['role' => UserRole::Owner])->save();
        });
        DB::statement('SET CONSTRAINTS users_owner_kept IMMEDIATE');

        expect($this->admin->fresh()->role)->toBe(UserRole::Owner);
    });
});
