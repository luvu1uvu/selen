<?php

use App\Enums\SpaceRole;
use App\Models\CardType;
use App\Models\EventLogEntry;

/** Участник пространства — справочник типов карточек компании пространства (GET spaces/{key}/card-types, ADR-0024). */
function cardTypesOfSpace($test)
{
    $space = space();
    addToSpace($space, $reader = member(), SpaceRole::Commenter);

    return $test->actingAs($reader)->getJson("/api/v1/spaces/{$space->key}/card-types");
}

it('предустановлены четыре типа, по умолчанию — «Задача»', function () {
    expect(CardType::query()->ordered()->pluck('name')->all())->toBe(['Задача', 'Баг', 'История', 'Эпик'])
        ->and(CardType::default(company())->name)->toBe('Задача');

    cardTypesOfSpace($this)
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->assertJsonPath('data.0.is_default', true)
        ->assertJsonPath('data.0.color', '#3b82f6');
});

it('администратор компании создаёт и меняет тип', function () {
    $admin = admin();

    $id = $this->actingAs($admin)->postJson(adminPath().'card-types', ['name' => 'Улучшение', 'color' => '#F59E0B'])
        ->assertCreated()
        ->assertJsonPath('data.color', '#f59e0b')
        ->json('data.id');

    $this->actingAs($admin)->patchJson(adminPath()."card-types/{$id}", ['name' => 'Доработка'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Доработка')
        ->assertJsonPath('data.color', '#f59e0b');

    expect(loggedEventTypes())->toBe(['card_type.created', 'card_type.updated'])
        ->and(EventLogEntry::query()->orderByDesc('id')->first()->payload)->toEqual(['fields' => ['name']]);
});

it('проверяет название и цвет типа', function (array $data, string $field) {
    $this->actingAs(admin())->postJson(adminPath().'card-types', $data + ['name' => 'Новый', 'color' => '#000000'])
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

    $this->actingAs($admin)->postJson(adminPath()."card-types/{$bug->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', fn ($value) => $value !== null);
    $this->actingAs($admin)->postJson(adminPath()."card-types/{$bug->id}/archive")->assertUnprocessable();

    cardTypesOfSpace($this)->assertJsonCount(3, 'data');
    $this->actingAs($admin)->getJson(adminPath().'card-types')->assertJsonCount(4, 'data');

    $this->actingAs($admin)->postJson(adminPath()."card-types/{$bug->id}/restore")->assertOk();
    $this->actingAs($admin)->postJson(adminPath()."card-types/{$bug->id}/restore")->assertUnprocessable();
    expect(loggedEventTypes())->toBe(['card_type.archived', 'card_type.restored']);
});

it('тип по умолчанию архивировать нельзя', function () {
    $this->actingAs(admin())->postJson(adminPath().'card-types/'.CardType::default(company())->id.'/archive')
        ->assertUnprocessable()
        ->assertJsonPath('errors.card_type.0', __('selen.card_types.default_cannot_be_archived'));
});

it('обычный сотрудник не управляет справочником', function () {
    $user = member();
    $task = CardType::default(company());

    $this->actingAs($user)->getJson(adminPath().'card-types')->assertForbidden();
    $this->actingAs($user)->postJson(adminPath().'card-types', ['name' => 'X', 'color' => '#000000'])->assertForbidden();
    $this->actingAs($user)->patchJson(adminPath()."card-types/{$task->id}", ['name' => 'X'])->assertForbidden();
    $this->actingAs($user)->postJson(adminPath()."card-types/{$task->id}/archive")->assertForbidden();
    $this->actingAs($user)->postJson(adminPath()."card-types/{$task->id}/restore")->assertForbidden();
});
