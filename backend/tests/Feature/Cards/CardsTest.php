<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\CardTransition;
use App\Models\CardType;
use App\Models\EventLogEntry;
use App\Models\Lane;

beforeEach(function () {
    $this->editor = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, admin(), BoardTemplate::Simple);
    $this->lane = firstLane($this->board);
});

function createCardRequest($test, array $data = [])
{
    return $test->actingAs($test->editor)->postJson("/api/v1/boards/{$test->board->id}/cards", $data + [
        'title' => 'Новая карточка',
        'column_id' => columnNamed($test->board, 'To Do')->id,
        'lane_id' => $test->lane->id,
    ]);
}

/** Названия карточек ячейки по порядку. */
function cellTitles(string $columnId, string $laneId): array
{
    return Card::query()->active()->where('column_id', $columnId)->where('lane_id', $laneId)
        ->orderBy('position')->pluck('title')->all();
}

it('создаёт карточку с номером пространства и типом по умолчанию', function () {
    createCardRequest($this)
        ->assertCreated()
        ->assertJsonPath('data.key', 'DEV-1')
        ->assertJsonPath('data.card_type.name', 'Задача')
        ->assertJsonPath('data.column.name', 'To Do')
        ->assertJsonPath('data.column.category', 'queue')
        ->assertJsonPath('data.created_by.id', $this->editor->id)
        ->assertJsonPath('data.first_started_at', null)
        ->assertJsonPath('data.moved_at', null)
        ->assertJsonPath('data.metrics', ['lead_time_seconds' => null, 'cycle_time_seconds' => null]);

    createCardRequest($this)->assertJsonPath('data.key', 'DEV-2');

    $transition = CardTransition::query()->where('reason', 'created')->firstOrFail();
    expect($transition)->from_column_id->toBeNull()->from_category->toBeNull()
        ->and($transition->to_category->value)->toBe('queue')
        ->and(Card::query()->where('number', 1)->sole()->created_at->equalTo($transition->moved_at))->toBeTrue();

    expect(EventLogEntry::query()->where('event_type', 'card.created')->first()->payload)->toMatchArray(['number' => 1]);
});

it('нумерация своя в каждом пространстве, монотонна и не переиспользуется', function () {
    $other = space(['key' => 'OPS']);
    addToSpace($other, $this->editor, SpaceRole::Editor);
    $otherBoard = makeBoard($other, admin(), BoardTemplate::Simple);

    makeCard($this->board, 'To Do', $this->editor);
    $second = makeCard($this->board, 'To Do', $this->editor);
    $ops = makeCard($otherBoard, 'To Do', $this->editor);
    $second->forceFill(['archived_at' => now()])->save();
    $third = makeCard($this->board, 'To Do', $this->editor);

    expect($ops->number)->toBe(1)
        ->and($third->number)->toBe(3)
        ->and($this->space->fresh()->last_card_number)->toBe(3);
});

it('проверяет данные карточки и ячейку доски', function (Closure $data, string $field) {
    createCardRequest($this, $data($this))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'без названия' => [fn () => ['title' => ''], 'title'],
    'колонка другой доски' => [fn ($t) => ['column_id' => columnNamed(makeBoard($t->space, admin(), BoardTemplate::Simple), 'Done')->id], 'column_id'],
    'дорожка другой доски' => [fn ($t) => ['lane_id' => firstLane(makeBoard($t->space, admin(), BoardTemplate::Simple))->id], 'lane_id'],
    'архивный тип' => [function () {
        $type = CardType::query()->where('name', 'Баг')->sole();
        $type->forceFill(['archived_at' => now()])->save();

        return ['card_type_id' => $type->id];
    }, 'card_type_id'],
]);

it('ставит карточку между соседями', function () {
    $todo = columnNamed($this->board, 'To Do');
    $a = createCardRequest($this, ['title' => 'A'])->json('data.id');
    $c = createCardRequest($this, ['title' => 'C'])->json('data.id');
    createCardRequest($this, ['title' => 'B', 'after_id' => $a, 'before_id' => $c]);
    createCardRequest($this, ['title' => 'Начало', 'before_id' => $a]);

    expect(cellTitles($todo->id, $this->lane->id))->toBe(['Начало', 'A', 'B', 'C']);
});

it('открывает карточку по номеру; чужая, несуществующая и кривая ссылка — одинаковый 404', function () {
    makeCard($this->board, 'To Do', $this->editor, 'Задача');
    $stranger = member();

    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')
        ->assertOk()->assertJsonPath('data.title', 'Задача')->assertJsonPath('data.permissions.edit', true);

    $foreign = $this->actingAs($stranger)->getJson('/api/v1/cards/DEV-1')->assertNotFound();
    expect($this->actingAs($stranger)->getJson('/api/v1/cards/DEV-999')->assertNotFound()->json())->toBe($foreign->json());
    $this->actingAs($this->editor)->getJson('/api/v1/cards/dev-1')->assertNotFound();
    $this->actingAs($this->editor)->getJson('/api/v1/cards/'.Card::query()->value('id'))->assertNotFound();
});

it('меняет название, описание и тип; в журнал — только имена полей и id типа', function () {
    $card = makeCard($this->board, 'To Do', $this->editor);
    $bug = CardType::query()->where('name', 'Баг')->sole();

    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', [
        'title' => 'Секретное название', 'description' => richText('Текст'), 'card_type_id' => $bug->id,
    ])->assertOk()->assertJsonPath('data.card_type.name', 'Баг');

    expect(EventLogEntry::query()->where('event_type', 'card.updated')->sole()->payload)->toEqual([
        'fields' => ['card_type_id', 'description', 'title'],
        'changes' => ['card_type_id' => ['from' => $card->card_type_id, 'to' => $bug->id]],
    ]);
});

it('перемещение между колонками — переход; перестановка в ячейке — не переход', function () {
    $todo = columnNamed($this->board, 'To Do');
    $progress = columnNamed($this->board, 'In Progress');
    $a = makeCard($this->board, 'To Do', $this->editor, 'A');
    $b = makeCard($this->board, 'To Do', $this->editor, 'B');

    // Перестановка B выше A: только position
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-2/move', [
        'column_id' => $todo->id, 'lane_id' => $this->lane->id, 'before_id' => $a->id,
    ])->assertOk();
    expect(cellTitles($todo->id, $this->lane->id))->toBe(['B', 'A'])
        ->and(CardTransition::query()->where('reason', 'manual')->count())->toBe(0)
        ->and(loggedEventTypes())->toContain('card.reordered');

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', [
        'column_id' => $progress->id, 'lane_id' => $this->lane->id,
    ])->assertOk()->assertJsonPath('data.column.category', 'in_progress');

    $transition = CardTransition::query()->where('reason', 'manual')->sole();
    expect($transition)
        ->card_id->toBe($a->id)
        ->from_column_id->toBe($todo->id)
        ->to_column_id->toBe($progress->id)
        ->from_board_id->toBe($this->board->id)
        ->actor_id->toBe($this->editor->id)
        ->and($a->fresh()->first_started_at)->not->toBeNull();

    $moved = EventLogEntry::query()->where('event_type', 'card.moved')->sole();
    expect($moved->payload)->toMatchArray(['transition_id' => $transition->id, 'reason' => 'manual', 'to_category' => 'in_progress']);
});

it('перестановка между дорожками — тоже переход', function () {
    addToSpace($this->space, $owner = member(), SpaceRole::Admin);
    $this->actingAs($owner)->postJson("/api/v1/boards/{$this->board->id}/lanes", ['name' => 'Вторая'])->assertCreated();
    $todo = columnNamed($this->board, 'To Do');
    $lanes = Lane::query()->where('board_id', $this->board->id)->orderBy('position')->get();
    makeCard($this->board, 'To Do', $this->editor);

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', ['column_id' => $todo->id, 'lane_id' => $lanes[1]->id])->assertOk();

    expect(CardTransition::query()->where('reason', 'manual')->sole())
        ->from_lane_id->toBe($lanes[0]->id)->to_lane_id->toBe($lanes[1]->id)
        ->from_column_id->toBe($todo->id)->to_column_id->toBe($todo->id);
});

it('перемещает на другую доску того же пространства, но не в другое пространство', function () {
    $target = makeBoard($this->space, admin(), BoardTemplate::Simple);
    makeCard($this->board, 'To Do', $this->editor);

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', [
        'board_id' => $target->id, 'column_id' => columnNamed($target, 'Done')->id, 'lane_id' => firstLane($target)->id,
    ])->assertOk()->assertJsonPath('data.board.id', $target->id);

    expect(CardTransition::query()->where('reason', 'manual')->sole())
        ->from_board_id->toBe($this->board->id)->to_board_id->toBe($target->id);

    $other = space();
    addToSpace($other, $this->editor, SpaceRole::Admin);
    $foreign = makeBoard($other, $this->editor, BoardTemplate::Simple);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', [
        'board_id' => $foreign->id, 'column_id' => columnNamed($foreign, 'To Do')->id, 'lane_id' => firstLane($foreign)->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('board_id');

    // Колонка другой доски без board_id — тоже 422
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', [
        'column_id' => columnNamed($this->board, 'To Do')->id, 'lane_id' => firstLane($target)->id,
    ])->assertUnprocessable()->assertJsonValidationErrors(['column_id']);
});

it('перемещение по устаревшим данным не ломает порядок', function () {
    $todo = columnNamed($this->board, 'To Do');
    $done = columnNamed($this->board, 'Done');
    $a = makeCard($this->board, 'To Do', $this->editor, 'A');
    $b = makeCard($this->board, 'To Do', $this->editor, 'B');
    makeCard($this->board, 'To Do', $this->editor, 'C');
    // Пока клиент думал, A уехала в Done
    moveCard($a, 'Done', $this->editor);

    // Клиент просит «после A, перед B» — A в ячейке уже нет: сервер ставит перед B
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-3/move', [
        'column_id' => $todo->id, 'lane_id' => $this->lane->id, 'after_id' => $a->id, 'before_id' => $b->id,
    ])->assertOk();
    expect(cellTitles($todo->id, $this->lane->id))->toBe(['C', 'B']);

    // Оба соседа устарели — в конец ячейки
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-2/move', [
        'column_id' => $done->id, 'lane_id' => $this->lane->id, 'after_id' => '01JA0000000000000000000000', 'before_id' => $b->id,
    ])->assertOk();
    expect(cellTitles($done->id, $this->lane->id))->toBe(['A', 'B']);
});

it('архивирует и восстанавливает карточку; архивную нельзя менять', function () {
    makeCard($this->board, 'To Do', $this->editor, 'A');
    makeCard($this->board, 'To Do', $this->editor, 'B');
    $todo = columnNamed($this->board, 'To Do');

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk()->assertJsonPath('data.archived_at', fn ($v) => $v !== null);
    $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")->assertJsonPath('data.cards.*.key', ['DEV-2']);
    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')->assertOk();
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['title' => 'X'])->assertUnprocessable();
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/move', ['column_id' => $todo->id, 'lane_id' => $this->lane->id])
        ->assertUnprocessable();

    // Восстановление — в конец своей ячейки, без перехода
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/restore')->assertOk()->assertJsonPath('data.archived_at', null);
    expect(cellTitles($todo->id, $this->lane->id))->toBe(['B', 'A'])
        ->and(CardTransition::query()->where('reason', 'manual')->count())->toBe(0);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/restore')->assertUnprocessable();
    expect(loggedEventTypes())->toContain('card.archived', 'card.restored');
});

it('если колонку архивировали, карточка восстанавливается в первую колонку с переходом', function () {
    $card = makeCard($this->board, 'Review', $this->editor);
    $card->forceFill(['archived_at' => now()])->save();
    $review = columnNamed($this->board, 'Review');
    addToSpace($this->space, $owner = member(), SpaceRole::Admin);
    $this->actingAs($owner)->postJson("/api/v1/columns/{$review->id}/archive")->assertOk();

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/restore')
        ->assertOk()->assertJsonPath('data.column.name', 'To Do');

    expect(CardTransition::query()->where('reason', 'manual')->sole())
        ->from_column_id->toBe($review->id)
        ->and($card->fresh()->first_started_at)->not->toBeNull()
        ->and($card->fresh()->completed_at)->toBeNull();
});

it('история перемещений карточки — по порядку, с текущими названиями', function () {
    $card = makeCard($this->board, 'To Do', $this->editor);
    moveCard($card, 'In Progress', $this->editor);

    $moved = CardTransition::query()->where('reason', 'manual')->sole()->moved_at;
    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')
        ->assertOk()->assertJsonPath('data.moved_at', $moved->format('Y-m-d\TH:i:s.u\Z'));

    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/transitions')
        ->assertOk()
        ->assertJsonPath('data.*.reason', ['created', 'manual'])
        ->assertJsonPath('data.0.from_column', null)
        ->assertJsonPath('data.1.from_column.name', 'To Do')
        ->assertJsonPath('data.1.to_column.name', 'In Progress')
        ->assertJsonPath('data.1.actor.id', $this->editor->id);
});
