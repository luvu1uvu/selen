<?php

use App\Enums\SpaceRole;
use App\Models\EventLogEntry;
use App\Models\Space;
use App\Models\User;

it('системный администратор создаёт пространство и по умолчанию становится его администратором', function () {
    $admin = admin();

    $this->actingAs($admin)->postJson('/api/v1/admin/spaces', [
        'name' => 'Разработка',
        'key' => ' dev ',
        'description' => 'Команда разработки',
    ])
        ->assertCreated()
        ->assertJsonPath('data.key', 'DEV')
        ->assertJsonPath('data.members_count', 1)
        ->assertJsonPath('data.admins.0.id', $admin->id)
        ->assertJsonPath('data.my_role', 'admin');

    $space = Space::query()->sole();
    expect($space->roleOf($admin))->toBe(SpaceRole::Admin)
        ->and(loggedEventTypes())->toBe(['space.created', 'space.member_added']);

    $added = EventLogEntry::query()->where('event_type', 'space.member_added')->sole();
    expect($added->subject_id)->toBe($space->id)
        ->and($added->payload)->toEqual(['user_id' => $admin->id, 'role' => 'admin', 'via' => 'space_created']);
});

it('назначает администраторами пространства указанных пользователей', function () {
    $admin = admin();
    [$anna, $boris] = [member(), member()];

    $this->actingAs($admin)->postJson('/api/v1/admin/spaces', [
        'name' => 'Маркетинг', 'key' => 'MKT', 'admin_ids' => [$anna->id, $boris->id],
    ])
        ->assertCreated()
        ->assertJsonPath('data.members_count', 2)
        ->assertJsonPath('data.my_role', null);

    $space = Space::query()->sole();
    expect($space->roleOf($anna))->toBe(SpaceRole::Admin)
        ->and($space->roleOf($boris))->toBe(SpaceRole::Admin)
        ->and($space->roleOf($admin))->toBeNull()
        ->and(EventLogEntry::query()->where('event_type', 'space.created')->sole()->payload)
        ->toEqual(['admin_ids' => [$anna->id, $boris->id]]);
});

it('проверяет название, ключ и администраторов пространства', function (array $data, string $field) {
    space(['key' => 'OPS']);

    $this->actingAs(admin())->postJson('/api/v1/admin/spaces', $data + ['name' => 'Пространство', 'key' => 'NEW'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'пустое название' => [['name' => ''], 'name'],
    'ключ короче 2' => [['key' => 'A'], 'key'],
    'ключ длиннее 10' => [['key' => 'ABCDEFGHIJK'], 'key'],
    'ключ не латиница' => [['key' => 'ДЕВ'], 'key'],
    'ключ с цифрами' => [['key' => 'DEV1'], 'key'],
    'ключ занят' => [['key' => 'ops'], 'key'],
    'пустой список админов' => [['admin_ids' => []], 'admin_ids'],
    'несуществующий админ' => [['admin_ids' => ['01JA0000000000000000000000']], 'admin_ids.0'],
]);

it('не назначает администратором деактивированного пользователя', function () {
    $gone = User::factory()->deactivated()->create();

    $this->actingAs(admin())->postJson('/api/v1/admin/spaces', ['name' => 'X', 'key' => 'XX', 'admin_ids' => [$gone->id]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('admin_ids.0');
});

it('обычный сотрудник не может создавать пространства и видеть админку', function () {
    $user = member();

    $this->actingAs($user)->postJson('/api/v1/admin/spaces', ['name' => 'X', 'key' => 'XX'])->assertForbidden();
    $this->actingAs($user)->getJson('/api/v1/admin/spaces')->assertForbidden();
    expect(Space::query()->count())->toBe(0);
});

it('админка показывает все пространства с администраторами и числом участников', function () {
    $admin = admin();
    $anna = member(['name' => 'Анна']);
    $dev = space(['name' => 'Разработка', 'key' => 'DEV']);
    addToSpace($dev, $anna, SpaceRole::Admin);
    addToSpace($dev, member(), SpaceRole::Editor);
    space(['name' => 'Архив', 'key' => 'OLD', 'archived_at' => now()]);

    $this->actingAs($admin)->getJson('/api/v1/admin/spaces')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.key', 'OLD')
        ->assertJsonPath('data.1.key', 'DEV')
        ->assertJsonPath('data.1.members_count', 2)
        ->assertJsonPath('data.1.admins', [['id' => $anna->id, 'name' => 'Анна', 'status' => 'active']])
        ->assertJsonPath('data.1.my_role', null);
});

it('системный администратор не видит содержимое пространства, пока не назначит себе роль', function () {
    $admin = admin();
    $space = space(['key' => 'DEV']);
    addToSpace($space, member(), SpaceRole::Admin);

    $this->actingAs($admin)->getJson('/api/v1/spaces/DEV')->assertNotFound();
    $this->actingAs($admin)->getJson('/api/v1/spaces/DEV/members')->assertNotFound();
    $this->actingAs($admin)->getJson('/api/v1/spaces')->assertJsonCount(0, 'data');

    $this->actingAs($admin)->putJson("/api/v1/admin/spaces/{$space->id}/members/{$admin->id}", ['role' => 'commenter'])
        ->assertOk()
        ->assertJsonPath('data.my_role', 'commenter');

    $this->actingAs($admin)->getJson('/api/v1/spaces/DEV')->assertOk()->assertJsonPath('data.my_role', 'commenter');

    $event = EventLogEntry::query()->where('event_type', 'space.member_added')->sole();
    expect($event->actor_id)->toBe($admin->id)
        ->and($event->payload)->toEqual(['user_id' => $admin->id, 'role' => 'commenter', 'via' => 'admin_panel']);
});

it('из админки можно сменить роль участника, но не оставить пространство без администратора', function () {
    $admin = admin();
    $anna = member();
    $space = space();
    addToSpace($space, $anna, SpaceRole::Admin);

    $this->actingAs($admin)->putJson("/api/v1/admin/spaces/{$space->id}/members/{$anna->id}", ['role' => 'editor'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    $this->actingAs($admin)->putJson("/api/v1/admin/spaces/{$space->id}/members/{$admin->id}", ['role' => 'admin'])->assertOk();
    $this->actingAs($admin)->putJson("/api/v1/admin/spaces/{$space->id}/members/{$anna->id}", ['role' => 'editor'])
        ->assertOk()
        ->assertJsonPath('data.admins.0.id', $admin->id);

    expect(EventLogEntry::query()->where('event_type', 'space.member_role_changed')->sole()->payload)
        ->toEqual(['user_id' => $anna->id, 'from' => 'admin', 'to' => 'editor', 'via' => 'admin_panel']);
});

it('архивирует и восстанавливает пространство', function () {
    $admin = admin();
    $anna = member();
    $space = space(['key' => 'DEV']);
    addToSpace($space, $anna, SpaceRole::Admin);

    $this->actingAs($admin)->postJson("/api/v1/admin/spaces/{$space->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', fn ($value) => $value !== null);
    $this->actingAs($admin)->postJson("/api/v1/admin/spaces/{$space->id}/archive")->assertUnprocessable();

    // Архивное пространство пропадает из навигации, но доступно участникам по ссылке — только для чтения
    $this->actingAs($anna)->getJson('/api/v1/spaces')->assertJsonCount(0, 'data');
    $this->actingAs($anna)->getJson('/api/v1/spaces/DEV')
        ->assertOk()
        ->assertJsonPath('data.permissions', ['manage' => false, 'edit_cards' => false, 'view_access_sources' => true]);
    $this->actingAs($anna)->patchJson('/api/v1/spaces/DEV', ['name' => 'Новое'])
        ->assertForbidden()
        ->assertJsonPath('message', __('selen.spaces.archived'));

    $this->actingAs($admin)->postJson("/api/v1/admin/spaces/{$space->id}/restore")
        ->assertOk()
        ->assertJsonPath('data.archived_at', null);
    $this->actingAs($admin)->postJson("/api/v1/admin/spaces/{$space->id}/restore")->assertUnprocessable();
    $this->actingAs($anna)->getJson('/api/v1/spaces')->assertJsonCount(1, 'data');

    expect(loggedEventTypes())->toBe(['space.archived', 'space.restored']);
});

it('архивировать, восстанавливать и назначать роли может только системный администратор', function () {
    $user = member();
    $space = space();
    addToSpace($space, $user, SpaceRole::Admin);

    $this->actingAs($user)->postJson("/api/v1/admin/spaces/{$space->id}/archive")->assertForbidden();
    $this->actingAs($user)->postJson("/api/v1/admin/spaces/{$space->id}/restore")->assertForbidden();
    $this->actingAs($user)->putJson("/api/v1/admin/spaces/{$space->id}/members/{$user->id}", ['role' => 'admin'])
        ->assertForbidden();
});
