<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\EventLogEntry;

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
});

it('создаёт доску по шаблону «Разработка»: колонки с типами и дорожка «Основная»', function () {
    $id = $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/boards', ['name' => 'Продукт', 'template' => 'development'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Продукт')
        ->json('data.id');

    $this->actingAs($this->owner)->getJson("/api/v1/boards/{$id}")
        ->assertOk()
        ->assertJsonPath('data.space.key', 'DEV')
        ->assertJsonPath('data.has_done_column', true)
        ->assertJsonPath('data.permissions', ['manage' => true, 'edit_cards' => true, 'delete_cards' => false])
        ->assertJsonPath('data.columns.*.name', [
            'Backlog', 'To Do', 'In Progress', 'Code Review', 'Ready for Testing', 'Testing', 'Ready for Merge', 'Done',
        ])
        ->assertJsonPath('data.columns.*.category', [
            'queue', 'queue', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'done',
        ])
        ->assertJsonPath('data.lanes.*.name', ['Основная'])
        ->assertJsonPath('data.cards', [])
        ->assertJsonCount(4, 'data.card_types');

    expect(EventLogEntry::query()->where('event_type', 'board.created')->sole()->payload)
        ->toEqual(['space_id' => $this->space->id, 'template' => 'development']);
});

it('шаблон «Простая» и «Пустая»', function () {
    $simple = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
    $empty = makeBoard($this->space, $this->owner, BoardTemplate::Empty);

    $this->actingAs($this->owner)->getJson("/api/v1/boards/{$simple->id}")
        ->assertJsonPath('data.columns.*.name', ['To Do', 'In Progress', 'Review', 'Done'])
        ->assertJsonPath('data.columns.*.category', ['queue', 'in_progress', 'in_progress', 'done']);

    // Без колонки «готово» метрики не посчитаются — интерфейс предупреждает по этому флагу
    $this->actingAs($this->owner)->getJson("/api/v1/boards/{$empty->id}")
        ->assertJsonPath('data.columns', [])
        ->assertJsonPath('data.lanes.*.name', ['Основная'])
        ->assertJsonPath('data.has_done_column', false);
});

it('проверяет данные новой доски', function (array $data, string $field) {
    $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/boards', $data + ['name' => 'Доска', 'template' => 'simple'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'без названия' => [['name' => ''], 'name'],
    'неизвестный шаблон' => [['template' => 'kanban'], 'template'],
]);

it('доски пространства — по порядку, вместе с архивными; сайдбар — только активные', function () {
    $first = makeBoard($this->space, $this->owner, name: 'Первая');
    $second = makeBoard($this->space, $this->owner, name: 'Вторая');
    $archived = makeBoard($this->space, $this->owner, name: 'Старая');
    $archived->forceFill(['archived_at' => now()])->save();

    $this->actingAs($this->owner)->getJson('/api/v1/spaces/DEV/boards')
        ->assertJsonPath('data.*.name', ['Первая', 'Вторая', 'Старая']);

    $this->actingAs($this->owner)->getJson('/api/v1/spaces')
        ->assertJsonPath('data.0.boards.*.id', [$first->id, $second->id]);
});

it('переименовывает доску', function () {
    $board = makeBoard($this->space, $this->owner);

    $this->actingAs($this->owner)->patchJson("/api/v1/boards/{$board->id}", ['name' => 'Новая', 'description' => 'Описание'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Новая');

    expect(EventLogEntry::query()->where('event_type', 'board.updated')->sole()->payload)
        ->toEqual(['fields' => ['description', 'name']]);
});

it('описание доски: задать при создании, изменить, стереть; из одних пробелов — без описания (LATER-64)', function () {
    $id = $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/boards', [
        'name' => 'Баги', 'description' => "  Как завести баг:\nшаги и ожидаемый результат  ", 'template' => 'simple',
    ])->assertCreated()->assertJsonPath('data.description', "Как завести баг:\nшаги и ожидаемый результат")->json('data.id');

    $this->actingAs($this->owner)->patchJson("/api/v1/boards/{$id}", ['description' => 'Новые правила'])
        ->assertOk()->assertJsonPath('data.description', 'Новые правила');
    $this->actingAs($this->owner)->patchJson("/api/v1/boards/{$id}", ['description' => '   '])
        ->assertOk()->assertJsonPath('data.description', null);
    $this->actingAs($this->owner)->getJson("/api/v1/boards/{$id}")->assertJsonPath('data.description', null);

    $blank = $this->actingAs($this->owner)->postJson('/api/v1/spaces/DEV/boards', [
        'name' => 'Пустая', 'description' => " \n ", 'template' => 'empty',
    ])->assertCreated()->json('data');
    expect($blank['description'])->toBeNull();

    // Текст описания в журнал не пишется — только имя поля
    expect(EventLogEntry::query()->where('event_type', 'board.updated')->pluck('payload')->all())
        ->toEqual([['fields' => ['description']], ['fields' => ['description']]]);
});

it('описание доски меняет только администратор пространства (LATER-64)', function () {
    $board = makeBoard($this->space, $this->owner);
    $editor = member();
    addToSpace($this->space, $editor, SpaceRole::Editor);

    $this->actingAs($editor)->patchJson("/api/v1/boards/{$board->id}", ['description' => 'Чужое'])->assertForbidden();
    $this->actingAs(member())->patchJson("/api/v1/boards/{$board->id}", ['description' => 'Чужое'])->assertNotFound();
    $this->actingAs($this->owner)->patchJson("/api/v1/boards/{$board->id}", ['description' => str_repeat('а', 2001)])
        ->assertUnprocessable()->assertJsonValidationErrors('description');
});

it('переставляет доски внутри пространства, порядок в БД совпадает с ключами', function () {
    $a = makeBoard($this->space, $this->owner, name: 'A');
    $b = makeBoard($this->space, $this->owner, name: 'B');
    $c = makeBoard($this->space, $this->owner, name: 'C');

    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$c->id}/move", ['before_id' => $a->id])->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$a->id}/move", ['after_id' => $b->id])->assertOk();

    expect(Board::query()->where('space_id', $this->space->id)->orderBy('position')->pluck('name')->all())->toBe(['C', 'B', 'A']);
    expect(loggedEventTypes())->toContain('board.moved');
});

it('перестановка не переносит доску в другое пространство: чужой сосед игнорируется', function () {
    $mine = makeBoard($this->space, $this->owner, name: 'Моя');
    makeBoard($this->space, $this->owner, name: 'Вторая');
    $other = space(['key' => 'OPS']);
    $foreign = makeBoard($other, member(), name: 'Чужая');

    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$mine->id}/move", ['after_id' => $foreign->id, 'space_id' => $other->id])
        ->assertOk();

    expect($mine->fresh()->space_id)->toBe($this->space->id)
        ->and(Board::query()->where('space_id', $this->space->id)->orderBy('position')->pluck('name')->all())->toBe(['Вторая', 'Моя']);
});

it('архивная доска доступна только для чтения и восстанавливается', function () {
    $board = makeBoard($this->space, $this->owner);
    $editor = member();
    addToSpace($this->space, $editor, SpaceRole::Editor);

    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$board->id}/archive")->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$board->id}/archive")->assertForbidden();

    $this->actingAs($editor)->getJson("/api/v1/boards/{$board->id}")
        ->assertOk()
        ->assertJsonPath('data.permissions', ['manage' => false, 'edit_cards' => false, 'delete_cards' => false]);
    $this->actingAs($editor)->postJson("/api/v1/boards/{$board->id}/cards", [
        'title' => 'X', 'column_id' => columnNamed($board, 'To Do')->id, 'lane_id' => firstLane($board)->id,
    ])->assertForbidden()->assertJsonPath('message', __('selen.boards.archived'));

    $this->actingAs($editor)->postJson("/api/v1/boards/{$board->id}/restore")->assertForbidden();
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$board->id}/restore")->assertOk()->assertJsonPath('data.archived_at', null);
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$board->id}/restore")->assertUnprocessable();

    expect(loggedEventTypes())->toContain('board.archived', 'board.restored');
});
