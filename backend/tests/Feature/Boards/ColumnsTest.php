<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\BoardColumn;
use App\Models\CardTransition;
use App\Models\EventLogEntry;

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
    $this->url = "/api/v1/boards/{$this->board->id}";
});

function boardColumnNames($test): array
{
    return $test->actingAs($test->owner)->getJson($test->url)->json('data.columns.*.name');
}

it('добавляет колонку первого уровня с типом в указанное место', function () {
    $review = columnNamed($this->board, 'Review');

    $this->actingAs($this->owner)->postJson("{$this->url}/columns", [
        'name' => 'QA', 'category' => 'in_progress', 'after_id' => $review->id,
    ])->assertCreated()->assertJsonPath('data.category', 'in_progress');

    expect(boardColumnNames($this))->toBe(['To Do', 'In Progress', 'Review', 'QA', 'Done']);
});

it('у колонки первого уровня тип обязателен, у подколонки — запрещён; глубже двух уровней нельзя', function () {
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Без типа'])
        ->assertUnprocessable()->assertJsonValidationErrors('category');

    $progress = columnNamed($this->board, 'In Progress');
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Под', 'parent_id' => $progress->id, 'category' => 'done'])
        ->assertUnprocessable()->assertJsonValidationErrors('category');

    $child = $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Разработка', 'parent_id' => $progress->id])
        ->assertCreated()->json('data.id');

    // Родителем может быть только активная колонка первого уровня этой доски
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Глубже', 'parent_id' => $child])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
    $foreign = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'X', 'parent_id' => columnNamed($foreign, 'Done')->id])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
});

it('подколонки наследуют тип родителя', function () {
    $progress = columnNamed($this->board, 'In Progress');
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Разработка', 'parent_id' => $progress->id])->assertCreated();
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Проверка', 'parent_id' => $progress->id])->assertCreated();

    $columns = $this->actingAs($this->owner)->getJson($this->url)->json('data.columns');

    expect(array_column($columns, 'name'))->toBe(['To Do', 'In Progress', 'Разработка', 'Проверка', 'Review', 'Done'])
        ->and($columns[2])->toMatchArray(['parent_id' => $progress->id, 'category' => 'in_progress'])
        ->and($columns[3]['category'])->toBe('in_progress');
});

it('первая подколонка забирает карточки колонки: переход column_split, порядок сохраняется', function () {
    $first = makeCard($this->board, 'In Progress', $this->owner, 'Первая');
    $second = makeCard($this->board, 'In Progress', $this->owner, 'Вторая');
    $progress = columnNamed($this->board, 'In Progress');

    $childId = $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Разработка', 'parent_id' => $progress->id])
        ->assertCreated()->json('data.id');

    expect([$first->fresh()->column_id, $second->fresh()->column_id])->toBe([$childId, $childId])
        ->and(strcmp($first->fresh()->position, $second->fresh()->position))->toBeLessThan(0);

    $split = CardTransition::query()->where('reason', 'column_split')->orderBy('id')->get();
    expect($split)->toHaveCount(2)
        ->and($split[0])->from_column_id->toBe($progress->id)->to_column_id->toBe($childId)
        ->and($split[0]->from_category->value)->toBe('in_progress')
        ->and($split[0]->to_category->value)->toBe('in_progress');

    // Вторая подколонка карточки не трогает
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Проверка', 'parent_id' => $progress->id])->assertCreated();
    expect(CardTransition::query()->where('reason', 'column_split')->count())->toBe(2);

    // Карточки нельзя класть в колонку с подколонками
    $this->actingAs($this->owner)->postJson("{$this->url}/cards", [
        'title' => 'X', 'column_id' => $progress->id, 'lane_id' => firstLane($this->board)->id,
    ])->assertUnprocessable()->assertJsonPath('errors.column_id.0', __('selen.columns.not_leaf'));
});

it('переименовывает и переставляет колонки', function () {
    $review = columnNamed($this->board, 'Review');
    $todo = columnNamed($this->board, 'To Do');

    $this->actingAs($this->owner)->patchJson("/api/v1/columns/{$review->id}", ['name' => 'Ревью'])->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/columns/{$review->id}/move", ['before_id' => $todo->id])->assertOk();

    expect(boardColumnNames($this))->toBe(['Ревью', 'To Do', 'In Progress', 'Done'])
        ->and(loggedEventTypes())->toContain('column.renamed', 'column.moved');
});

it('смена типа колонки меняет статус её карточек переходом column_type_changed', function () {
    $card = makeCard($this->board, 'Review', $this->owner);
    $other = makeCard($this->board, 'To Do', $this->owner);
    $review = columnNamed($this->board, 'Review');

    $this->actingAs($this->owner)->putJson("/api/v1/columns/{$review->id}/category", ['category' => 'done'])
        ->assertOk()
        ->assertJsonPath('data.category', 'done')
        ->assertJsonPath('data.cards_affected', 1);

    $transition = CardTransition::query()->where('reason', 'column_type_changed')->sole();
    expect($transition)
        ->card_id->toBe($card->id)
        ->from_column_id->toBe($review->id)
        ->to_column_id->toBe($review->id)
        ->and($transition->from_category->value)->toBe('in_progress')
        ->and($transition->to_category->value)->toBe('done')
        ->and($card->fresh()->completed_at)->not->toBeNull()
        ->and($other->fresh()->completed_at)->toBeNull();

    expect(EventLogEntry::query()->where('event_type', 'column.category_changed')->sole()->payload)->toEqual([
        'board_id' => $this->board->id, 'from' => 'in_progress', 'to' => 'done', 'cards_affected' => 1,
    ]);

    // Повтор того же типа — ничего не меняет
    $this->actingAs($this->owner)->putJson("/api/v1/columns/{$review->id}/category", ['category' => 'done'])
        ->assertJsonPath('data.cards_affected', 0);
});

it('тип подколонки сменить нельзя — только у родителя', function () {
    $progress = columnNamed($this->board, 'In Progress');
    $child = $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Разработка', 'parent_id' => $progress->id])->json('data.id');

    $this->actingAs($this->owner)->putJson("/api/v1/columns/{$child}/category", ['category' => 'done'])
        ->assertUnprocessable()->assertJsonValidationErrors('category');
});

it('колонку с карточками нельзя архивировать; пустую — можно вместе с подколонками', function () {
    $review = columnNamed($this->board, 'Review');
    $card = makeCard($this->board, 'Review', $this->owner);

    $this->actingAs($this->owner)->postJson("/api/v1/columns/{$review->id}/archive")
        ->assertUnprocessable()->assertJsonPath('errors.column.0', __('selen.columns.has_cards'));

    moveCard($card, 'Done', $this->owner);
    $this->actingAs($this->owner)->postJson("{$this->url}/columns", ['name' => 'Под', 'parent_id' => $review->id])->assertCreated();
    $this->actingAs($this->owner)->postJson("/api/v1/columns/{$review->id}/archive")->assertOk();

    expect(BoardColumn::query()->where('board_id', $this->board->id)->whereNotNull('archived_at')->count())->toBe(2)
        ->and(boardColumnNames($this))->toBe(['To Do', 'In Progress', 'Done']);
    $this->actingAs($this->owner)->postJson("/api/v1/columns/{$review->id}/archive")->assertUnprocessable();
});

it('без колонки «готово» доска помечается флагом', function () {
    $done = columnNamed($this->board, 'Done');
    $this->actingAs($this->owner)->putJson("/api/v1/columns/{$done->id}/category", ['category' => 'in_progress'])->assertOk();

    $this->actingAs($this->owner)->getJson($this->url)->assertJsonPath('data.has_done_column', false);
});
