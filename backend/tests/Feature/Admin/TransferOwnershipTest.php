<?php

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\EventLogEntry;
use App\Models\User;
use Database\Factories\UserFactory;

/*
| Передача владения из интерфейса (ADR-0017): только Владелец, другому активному сотруднику, с подтверждением
| своим паролем. Бывший Владелец становится администратором; событие в журнале — только id.
*/

beforeEach(function () {
    $this->owner = owner(['email' => 'owner@selen.test']);
    $this->target = member(['email' => 'next@selen.test']);
    $this->transfer = fn (User $to, string $password = UserFactory::PASSWORD) => $this->actingAs($this->owner)
        ->postJson("/api/v1/admin/users/{$to->id}/transfer-ownership", ['password' => $password]);
});

it('передаёт владение: получатель — Владелец, бывший — администратор, событие без ПДн', function () {
    ($this->transfer)($this->target)
        ->assertOk()
        ->assertJsonPath('data.id', $this->target->id)
        ->assertJsonPath('data.role', 'owner')
        // Права в ответе — уже для бывшего Владельца (администратора): с Владельцем он ничего не может
        ->assertJsonPath('data.permissions.transfer_ownership', false)
        ->assertJsonPath('data.permissions.update_role', false);

    expect($this->target->fresh()->role)->toBe(UserRole::Owner)
        ->and($this->owner->fresh()->role)->toBe(UserRole::Admin)
        ->and(User::query()->where('role', UserRole::Owner)->count())->toBe(1);

    $event = EventLogEntry::query()->sole();
    expect($event)
        ->event_type->toBe('user.ownership_transferred')
        ->actor_id->toBe($this->owner->id)
        ->subject_id->toBe($this->target->id)
        ->and($event->payload)->toEqual([
            'from_user_id' => $this->owner->id,
            'to_user_id' => $this->target->id,
            'via' => 'admin_panel',
        ]);
    expectNoPersonalDataInEventLog();
});

it('администратору тоже можно передать владение', function () {
    $admin = admin();

    ($this->transfer)($admin)->assertOk()->assertJsonPath('data.role', 'owner');

    expect($admin->fresh()->role)->toBe(UserRole::Owner)
        ->and($this->owner->fresh()->role)->toBe(UserRole::Admin);
});

it('неверный пароль — 422 в поле password, владение не передано', function () {
    ($this->transfer)($this->target, 'wrong-password')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');

    expect($this->owner->fresh()->role)->toBe(UserRole::Owner)
        ->and($this->target->fresh()->role)->toBe(UserRole::Member)
        ->and(EventLogEntry::query()->count())->toBe(0);
});

it('без пароля — 422', function () {
    $this->actingAs($this->owner)->postJson("/api/v1/admin/users/{$this->target->id}/transfer-ownership")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');
});

it('неактивному сотруднику передать нельзя — 422', function (string $state) {
    $to = match ($state) {
        'deactivated' => User::factory()->deactivated()->create(),
        'invited' => User::factory()->invited()->create(),
    };

    ($this->transfer)($to)
        ->assertUnprocessable()
        ->assertJsonPath('errors.user_id.0', __('selen.users.owner_target_not_active'));

    expect($this->owner->fresh()->role)->toBe(UserRole::Owner)
        ->and($to->fresh()->role)->toBe(UserRole::Member);
})->with(['deactivated', 'invited']);

it('передать может только Владелец', function () {
    foreach ([admin(), member()] as $actor) {
        $this->actingAs($actor)
            ->postJson("/api/v1/admin/users/{$this->target->id}/transfer-ownership", ['password' => UserFactory::PASSWORD])
            ->assertForbidden();
    }

    expect($this->owner->fresh()->role)->toBe(UserRole::Owner);
});

it('права бывшего Владельца понижаются сразу, в его же открытой сессии', function () {
    $admin = admin();
    $session = browser();
    $session->post('/api/v1/auth/login', ['email' => 'owner@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();

    $session->post("/api/v1/admin/users/{$this->target->id}/transfer-ownership", ['password' => UserFactory::PASSWORD])
        ->assertOk();

    // Следующие запросы той же сессии — уже как администратор, без перезахода
    $session->get('/api/v1/auth/me')->assertOk()->assertJsonPath('data.role', 'admin');
    $session->post("/api/v1/admin/users/{$admin->id}/transfer-ownership", ['password' => UserFactory::PASSWORD])
        ->assertForbidden();
    $session->patch("/api/v1/admin/users/{$admin->id}/role", ['role' => 'member'])->assertForbidden();
    $session->post("/api/v1/admin/users/{$this->target->id}/deactivate")->assertForbidden();
    // Права обычного администратора остаются
    $session->get('/api/v1/admin/users')->assertOk();

    expect($admin->fresh()->role)->toBe(UserRole::Admin)
        ->and($this->target->fresh())->role->toBe(UserRole::Owner)->status->toBe(UserStatus::Active);
});

it('новый Владелец сразу получает исключительные права', function () {
    ($this->transfer)($this->target)->assertOk();
    $admin = admin();

    $this->actingAs($this->target->fresh())
        ->patchJson("/api/v1/admin/users/{$admin->id}/role", ['role' => 'member'])
        ->assertOk();
    $this->actingAs($this->target->fresh())
        ->patchJson("/api/v1/admin/users/{$this->owner->id}/role", ['role' => 'member'])
        ->assertOk();
});
