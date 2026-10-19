<?php

use App\Enums\SpaceRole;
use App\Models\EventLogEntry;
use App\Models\Space;
use App\Models\User;

beforeEach(function () {
    $this->owner = member(['name' => 'Анна']);
    $this->space = space(['key' => 'DEV', 'name' => 'Разработка']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
});

it('администратор пространства добавляет участника', function () {
    $boris = member(['name' => 'Борис']);

    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/members', ['user_id' => $boris->id, 'role' => 'editor'])
        ->assertCreated()
        ->assertJsonPath('data.user.id', $boris->id)
        ->assertJsonPath('data.role', 'editor');

    expect($this->space->roleOf($boris))->toBe(SpaceRole::Editor)
        ->and(EventLogEntry::query()->sole())
        ->event_type->toBe('space.member_added')
        ->actor_id->toBe($this->owner->id)
        ->payload->toEqual(['user_id' => $boris->id, 'role' => 'editor']);
});

it('приглашённого (ещё не вошедшего) сотрудника можно добавить заранее', function () {
    $newbie = User::factory()->invited()->create();

    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/members', ['user_id' => $newbie->id, 'role' => 'commenter'])
        ->assertCreated();
});

it('не добавляет деактивированного и уже состоящего пользователя', function () {
    $gone = User::factory()->deactivated()->create();

    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/members', ['user_id' => $gone->id, 'role' => 'editor'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.user_id.0', __('selen.spaces.member_deactivated'));

    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/members', ['user_id' => $this->owner->id, 'role' => 'editor'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.user_id.0', __('selen.spaces.already_member'));
});

it('проверяет данные нового участника', function (array $data, string $field) {
    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/members', $data)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'без пользователя' => [['role' => 'editor'], 'user_id'],
    'несуществующий' => [['user_id' => '01JA0000000000000000000000', 'role' => 'editor'], 'user_id'],
    'неизвестная роль' => [['user_id' => '01JA0000000000000000000000', 'role' => 'owner'], 'role'],
]);

it('показывает участников всем участникам, включая деактивированных', function () {
    $commenter = member(['name' => 'Вера']);
    $gone = User::factory()->deactivated()->create(['name' => 'Борис']);
    addToSpace($this->space, $commenter, SpaceRole::Commenter);
    addToSpace($this->space, $gone, SpaceRole::Editor);

    $this->actingAs($commenter)->getJson('/api/v1/spaces/DEV/members')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonPath('data.0.user.name', 'Анна')
        ->assertJsonPath('data.1.user.name', 'Борис')
        ->assertJsonPath('data.1.user.status', 'deactivated')
        ->assertJsonPath('data.2.role', 'commenter');
});

it('меняет роль участника и пишет было/стало в журнал', function () {
    $boris = member();
    addToSpace($this->space, $boris, SpaceRole::Editor);

    $this->actingAs($this->owner)->patchJson("/api/v1/spaces/DEV/members/{$boris->id}", ['role' => 'admin'])
        ->assertOk()
        ->assertJsonPath('data.role', 'admin');

    // Повтор той же роли — без события
    $this->actingAs($this->owner)->patchJson("/api/v1/spaces/DEV/members/{$boris->id}", ['role' => 'admin'])->assertOk();

    expect(EventLogEntry::query()->sole()->payload)->toEqual(['user_id' => $boris->id, 'from' => 'editor', 'to' => 'admin']);
});

it('исключает участника: строка участия удаляется, пользователь остаётся', function () {
    $boris = member();
    addToSpace($this->space, $boris, SpaceRole::Editor);

    $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/DEV/members/{$boris->id}")->assertNoContent();

    expect($this->space->members()->count())->toBe(1)
        ->and($boris->fresh())->not->toBeNull()
        ->and(EventLogEntry::query()->sole())
        ->event_type->toBe('space.member_removed')
        ->payload->toEqual(['user_id' => $boris->id, 'role' => 'editor']);

    $this->actingAs($boris)->getJson('/api/v1/spaces/DEV')->assertNotFound();
});

it('не позволяет оставить пространство без администратора', function () {
    $this->actingAs($this->owner)->patchJson("/api/v1/spaces/DEV/members/{$this->owner->id}", ['role' => 'editor'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.role.0', __('selen.spaces.last_admin'));
    $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/DEV/members/{$this->owner->id}")
        ->assertUnprocessable();

    // Деактивированный администратор не считается
    $gone = User::factory()->deactivated()->create();
    addToSpace($this->space, $gone, SpaceRole::Admin);
    $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/DEV/members/{$this->owner->id}")
        ->assertUnprocessable();

    // С другим активным администратором — можно (в том числе разжаловать себя)
    $second = member();
    addToSpace($this->space, $second, SpaceRole::Admin);
    $this->actingAs($this->owner)->patchJson("/api/v1/spaces/DEV/members/{$this->owner->id}", ['role' => 'editor'])
        ->assertOk();

    // Разжалованный больше не управляет участниками; второй администратор — может
    $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/DEV/members/{$gone->id}")->assertForbidden();
    $this->actingAs($second)->deleteJson("/api/v1/spaces/DEV/members/{$gone->id}")->assertNoContent();
});

it('изменение участника вне пространства — 404', function () {
    $stranger = member();

    $this->actingAs($this->owner)->patchJson("/api/v1/spaces/DEV/members/{$stranger->id}", ['role' => 'admin'])->assertNotFound();
    $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/DEV/members/{$stranger->id}")->assertNotFound();
});

it('администратор пространства меняет название и описание, но не ключ', function () {
    $this->actingAs($this->owner)->patchJson('/api/v1/spaces/DEV', ['name' => 'Разработка ядра', 'description' => 'Бэкенд', 'key' => 'NEW'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Разработка ядра')
        ->assertJsonPath('data.key', 'DEV');

    expect(EventLogEntry::query()->sole())
        ->event_type->toBe('space.updated')
        ->payload->toEqual(['fields' => ['description', 'name']]);

    $this->actingAs($this->owner)->patchJson('/api/v1/spaces/DEV', ['name' => ''])->assertUnprocessable();
});

it('список пространств пользователя — только свои и не архивные, с ролью и правами', function () {
    $other = space(['key' => 'OPS', 'name' => 'Эксплуатация']);
    addToSpace($other, $this->owner, SpaceRole::Commenter);
    space(['key' => 'MKT']);
    $archived = Space::factory()->archived()->create(['key' => 'OLD']);
    addToSpace($archived, $this->owner, SpaceRole::Admin);

    $this->actingAs($this->owner)->getJson('/api/v1/spaces')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.key', 'DEV')
        ->assertJsonPath('data.0.permissions', ['manage' => true, 'edit_cards' => true, 'view_access_sources' => true])
        ->assertJsonPath('data.1.key', 'OPS')
        ->assertJsonPath('data.1.my_role', 'commenter')
        ->assertJsonPath('data.1.permissions', ['manage' => false, 'edit_cards' => false, 'view_access_sources' => true]);
});

it('справочник сотрудников доступен администраторам пространств и системным', function () {
    member(['name' => 'Борис Петров', 'email' => 'boris@selen.test']);
    User::factory()->deactivated()->create(['name' => 'Борис Уволенный']);

    $this->actingAs($this->owner)->getJson('/api/v1/users/directory?search=бор')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.email', 'boris@selen.test');

    $this->actingAs(admin())->getJson('/api/v1/users/directory')->assertOk();

    $editor = member();
    addToSpace($this->space, $editor, SpaceRole::Editor);
    $this->actingAs($editor)->getJson('/api/v1/users/directory')->assertForbidden();
});
