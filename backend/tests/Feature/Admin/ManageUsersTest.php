<?php

use App\Actions\Users\ChangeUserRoleAction;
use App\Enums\CompanyRole;
use App\Enums\UserStatus;
use App\Models\EventLogEntry;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

it('показывает администратору список пользователей с фильтрами и поиском', function () {
    $admin = admin(['name' => 'Анна']);
    member(['name' => 'Борис', 'email' => 'boris@selen.test']);
    User::factory()->deactivated()->create(['name' => 'Вера']);
    Invitation::factory()->create();

    $this->actingAs($admin)->getJson(adminPath().'users')
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->assertJsonStructure(['data' => [['id', 'name', 'email', 'role', 'status', 'invitation']], 'meta' => ['total']]);

    $this->actingAs($admin)->getJson(adminPath().'users?status=deactivated')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Вера');

    // Поиск без учёта регистра; с доменом — случайный email Faker (borisova@example.org) не совпадёт
    $this->actingAs($admin)->getJson(adminPath().'users?search=BORIS@SELEN')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.email', 'boris@selen.test');

    $this->actingAs($admin)->getJson(adminPath().'users?status=invited')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.invitation.state', 'pending');
});

it('закрывает админку от участников', function () {
    $user = member();
    $this->actingAs(member());

    $this->getJson(adminPath().'users')->assertForbidden();
    $this->patchJson(adminPath()."users/{$user->id}/role", ['role' => 'admin'])->assertForbidden();
    $this->postJson(adminPath()."users/{$user->id}/deactivate")->assertForbidden();
    $this->postJson(adminPath()."users/{$user->id}/reactivate")->assertForbidden();
    $this->getJson(adminPath().'events')->assertForbidden();
});

it('Владелец меняет роль и пишет было/стало в журнал', function () {
    $owner = owner();
    $user = member();

    $this->actingAs($owner)->patchJson(adminPath()."users/{$user->id}/role", ['role' => 'admin'])
        ->assertOk()
        ->assertJsonPath('data.role', 'admin');

    $event = EventLogEntry::query()->sole();
    expect(company()->roleOf($user))->toBe('admin')
        ->and($event->event_type)->toBe('user.role_changed')
        // Событие — в журнале компании, где сменили роль (ADR-0024)
        ->and($event->company_id)->toBe(company()->id)
        ->and($event->payload)->toEqual(['from' => 'member', 'to' => 'admin']);
});

it('не даёт администратору менять свою роль и деактивировать себя', function () {
    $admin = admin();
    admin();

    $this->actingAs($admin)->patchJson(adminPath()."users/{$admin->id}/role", ['role' => 'member'])->assertForbidden();
    $this->actingAs($admin)->postJson(adminPath()."users/{$admin->id}/deactivate")->assertForbidden();
});

it('не позволяет оставить систему без активного администратора', function () {
    // База без Владельца (до миграции 3c или до первого app:create-admin): страховка в Action
    $admin = admin();
    $otherAdmin = admin();
    $otherAdmin->forceFill(['status' => UserStatus::Deactivated])->save();
    $invitedAdmin = User::factory()->admin()->invited()->create();

    // Единственный активный админ — $admin; понизить можно только неактивных
    app(ChangeUserRoleAction::class)->handle($admin, $invitedAdmin, company(), CompanyRole::Member);
    expect(company()->roleOf($invitedAdmin))->toBe('member');

    // Проверка внутри Action (политика не позволяет понизить себя, поэтому вызываем Action напрямую)
    expect(fn () => app(ChangeUserRoleAction::class)->handle($admin, $admin, company(), CompanyRole::Member))
        ->toThrow(ValidationException::class, __('selen.users.last_admin'));
});

it('Владелец считается активным администратором: последнего админа можно понизить', function () {
    $owner = owner();
    $admin = admin();

    $this->actingAs($owner)->patchJson(adminPath()."users/{$admin->id}/role", ['role' => 'member'])
        ->assertOk()
        ->assertJsonPath('data.role', 'member');
});

it('деактивирует пользователя: сессии и «Запомнить меня» перестают работать', function () {
    $admin = admin();
    $user = member(['email' => 'user@selen.test']);
    $userBrowser = browser('10.0.0.2');
    $userBrowser->post('/api/v1/auth/login', [
        'email' => 'user@selen.test', 'password' => UserFactory::PASSWORD, 'remember' => true,
    ])->assertOk();
    $rememberToken = $user->fresh()->remember_token;

    $this->actingAs($admin)->postJson(adminPath()."users/{$user->id}/deactivate")
        ->assertOk()
        ->assertJsonPath('data.status', 'deactivated');

    $user->refresh();
    expect($user->status)->toBe(UserStatus::Deactivated)
        ->and($user->deactivated_at)->not->toBeNull()
        ->and($user->remember_token)->not->toBe($rememberToken)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0);

    $userBrowser->get('/api/v1/auth/me')->assertUnauthorized();
    $userBrowser->forgetCookie('selen-session');
    $userBrowser->get('/api/v1/auth/me')->assertUnauthorized();

    expect(EventLogEntry::query()->latest('id')->first())
        ->event_type->toBe('user.deactivated')
        ->actor_id->toBe($admin->id);
});

it('не деактивирует уже неактивного пользователя', function () {
    $this->actingAs(admin())
        ->postJson(adminPath().'users/'.User::factory()->deactivated()->create()->id.'/deactivate')
        ->assertUnprocessable();
});

it('реактивирует ранее активного пользователя', function () {
    $admin = admin();
    $user = User::factory()->deactivated()->create(['email' => 'back@selen.test']);

    $this->actingAs($admin)->postJson(adminPath()."users/{$user->id}/reactivate")
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.deactivated_at', null);

    expect(loggedEventTypes())->toBe(['user.reactivated']);
    $this->postJson('/api/v1/auth/login', ['email' => 'back@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
});

it('не реактивирует того, кто не принял приглашение', function () {
    $user = User::factory()->invited()->create(['status' => UserStatus::Deactivated]);

    $this->actingAs(admin())->postJson(adminPath()."users/{$user->id}/reactivate")
        ->assertUnprocessable()
        ->assertJsonPath('errors.user.0', __('selen.users.never_activated'));
});
