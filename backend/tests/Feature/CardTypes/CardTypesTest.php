<?php

use App\Models\CardType;
use App\Models\EventLogEntry;

it('предустановлены четыре типа, по умолчанию — «Задача»', function () {
    expect(CardType::query()->ordered()->pluck('name')->all())->toBe(['Задача', 'Баг', 'История', 'Эпик'])
        ->and(CardType::default()->name)->toBe('Задача');

    $this->actingAs(member())->getJson('/api/v1/card-types')
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->assertJsonPath('data.0.is_default', true)
        ->assertJsonPath('data.0.color', '#3b82f6');
});

it('системный администратор создаёт и меняет тип', function () {
    $admin = admin();

    $id = $this->actingAs($admin)->postJson('/api/v1/admin/card-types', ['name' => 'Улучшение', 'color' => '#F59E0B'])
        ->assertCreated()
        ->assertJsonPath('data.color', '#f59e0b')
        ->json('data.id');

    $this->actingAs($admin)->patchJson("/api/v1/admin/card-types/{$id}", ['name' => 'Доработка'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Доработка')
        ->assertJsonPath('data.color', '#f59e0b');

    expect(loggedEventTypes())->toBe(['card_type.created', 'card_type.updated'])
        ->and(EventLogEntry::query()->orderByDesc('id')->first()->payload)->toEqual(['fields' => ['name']]);
});

it('проверяет название и цвет типа', function (array $data, string $field) {
    $this->actingAs(admin())->postJson('/api/v1/admin/card-types', $data + ['name' => 'Новый', 'color' => '#000000'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'пустое название' => [['name' => ''], 'name'],
    'занятое название' => [['name' => 'Баг'], 'name'],
    'цвет не hex' => [['color' => 'red'], 'color'],
    'короткий hex' => [['color' => '#fff'], 'color'],
]);

it('архивирует и восстанавливает тип; архивный не предлагается для новых карточек', function () {
    $admin = admin();
    $bug = CardType::query()->where('name', 'Баг')->sole();

    $this->actingAs($admin)->postJson("/api/v1/admin/card-types/{$bug->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', fn ($value) => $value !== null);
    $this->actingAs($admin)->postJson("/api/v1/admin/card-types/{$bug->id}/archive")->assertUnprocessable();

    $this->actingAs(member())->getJson('/api/v1/card-types')->assertJsonCount(3, 'data');
    $this->actingAs($admin)->getJson('/api/v1/admin/card-types')->assertJsonCount(4, 'data');

    $this->actingAs($admin)->postJson("/api/v1/admin/card-types/{$bug->id}/restore")->assertOk();
    $this->actingAs($admin)->postJson("/api/v1/admin/card-types/{$bug->id}/restore")->assertUnprocessable();
    expect(loggedEventTypes())->toBe(['card_type.archived', 'card_type.restored']);
});

it('тип по умолчанию архивировать нельзя', function () {
    $this->actingAs(admin())->postJson('/api/v1/admin/card-types/'.CardType::default()->id.'/archive')
        ->assertUnprocessable()
        ->assertJsonPath('errors.card_type.0', __('selen.card_types.default_cannot_be_archived'));
});

it('обычный сотрудник не управляет справочником', function () {
    $user = member();
    $task = CardType::default();

    $this->actingAs($user)->getJson('/api/v1/admin/card-types')->assertForbidden();
    $this->actingAs($user)->postJson('/api/v1/admin/card-types', ['name' => 'X', 'color' => '#000000'])->assertForbidden();
    $this->actingAs($user)->patchJson("/api/v1/admin/card-types/{$task->id}", ['name' => 'X'])->assertForbidden();
    $this->actingAs($user)->postJson("/api/v1/admin/card-types/{$task->id}/archive")->assertForbidden();
    $this->actingAs($user)->postJson("/api/v1/admin/card-types/{$task->id}/restore")->assertForbidden();
});
