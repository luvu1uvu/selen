<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\BoardRow;
use App\Models\EventLogEntry;
use App\Models\SpaceMember;
use Illuminate\Support\Facades\DB;

/*
| Раскладка досок пространства рядами (docs/adr/0019-board-and-space-layout.md): в ряду доски рядом, ряды друг под
| другом; раскладка общая, меняет её администратор пространства. Список досок — в порядке раскладки, без карточек.
*/

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->a = makeBoard($this->space, $this->owner, BoardTemplate::Simple, 'A');
    $this->b = makeBoard($this->space, $this->owner, BoardTemplate::Simple, 'B');
    $this->c = makeBoard($this->space, $this->owner, BoardTemplate::Simple, 'C');
    // Раскладка как в списке досок: ряды по порядку, в ряду — названия досок по порядку
    $this->layout = function () {
        $boards = $this->actingAs($this->owner)->getJson('/api/v1/spaces/DEV/boards')->assertOk()->json('data');
        $rows = [];
        foreach ($boards as $board) {
            $rows[$board['row_id']][] = $board['name'];
        }

        return array_values($rows);
    };
    $this->move = fn (Board $board, array $data) => $this->actingAs($this->owner)
        ->postJson("/api/v1/boards/{$board->id}/move", $data);
});

it('новая доска — новым рядом внизу', function () {
    expect(($this->layout)())->toBe([['A'], ['B'], ['C']])
        ->and(BoardRow::query()->where('space_id', $this->space->id)->count())->toBe(3);
});

it('в ряд к другой доске — между соседями; опустевший ряд удаляется; событие с рядом', function () {
    $row = $this->a->row_id;

    ($this->move)($this->c, ['row_id' => $row, 'after_id' => $this->a->id])->assertOk()->assertJsonPath('data.row_id', $row);
    expect(($this->layout)())->toBe([['A', 'C'], ['B']])
        ->and(BoardRow::query()->whereKey($this->c->row_id)->exists())->toBeFalse();

    ($this->move)($this->b, ['row_id' => $row, 'before_id' => $this->a->id])->assertOk();
    expect(($this->layout)())->toBe([['B', 'A', 'C']])
        ->and(BoardRow::query()->where('space_id', $this->space->id)->pluck('id')->all())->toBe([$row]);

    // Внутри своего ряда — просто порядок
    ($this->move)($this->b, ['row_id' => $row, 'after_id' => $this->c->id])->assertOk();
    expect(($this->layout)())->toBe([['A', 'C', 'B']]);

    expect(EventLogEntry::query()->where('event_type', 'board.moved')->pluck('payload')->all())
        ->toEqual([['row_id' => $row], ['row_id' => $row], ['row_id' => $row]]);
});

it('отдельным новым рядом — между рядами, в начало и в конец', function () {
    ($this->move)($this->a, ['row_id' => $this->b->row_id, 'after_id' => $this->b->id])->assertOk();
    expect(($this->layout)())->toBe([['B', 'A'], ['C']]);

    ($this->move)($this->a, ['new_row_after_id' => $this->b->row_id, 'new_row_before_id' => $this->c->row_id])->assertOk();
    expect(($this->layout)())->toBe([['B'], ['A'], ['C']]);

    ($this->move)($this->c, ['new_row_before_id' => $this->b->row_id])->assertOk();
    expect(($this->layout)())->toBe([['C'], ['B'], ['A']]);

    // Поле есть, но null — ряд в конце
    ($this->move)($this->c, ['new_row_after_id' => null])->assertOk();
    expect(($this->layout)())->toBe([['B'], ['A'], ['C']])
        ->and(BoardRow::query()->where('space_id', $this->space->id)->count())->toBe(3);
});

it('запрос без рядов, как до них: доска встаёт в ряд соседа рядом с ним; сосед не найден — новым рядом внизу', function () {
    ($this->move)($this->c, ['before_id' => $this->a->id])->assertOk();
    expect(($this->layout)())->toBe([['C', 'A'], ['B']]);

    ($this->move)($this->a, ['after_id' => $this->b->id])->assertOk();
    expect(($this->layout)())->toBe([['C'], ['B', 'A']]);

    ($this->move)($this->c, ['after_id' => (string) str()->ulid()])->assertOk();
    expect(($this->layout)())->toBe([['B', 'A'], ['C']]);
});

it('архивная доска держит место в ряду: ряд не удаляется, восстановленная встаёт на прежнее место', function () {
    ($this->move)($this->b, ['row_id' => $this->a->row_id, 'after_id' => $this->a->id])->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$this->b->id}/archive")->assertOk();
    ($this->move)($this->a, ['new_row_after_id' => $this->c->row_id])->assertOk();

    // В ряду остался только архивный B — ряд на месте; список отдаёт и архивные (страница их не показывает)
    expect(($this->layout)())->toBe([['B'], ['C'], ['A']])
        ->and(BoardRow::query()->where('space_id', $this->space->id)->count())->toBe(3);

    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$this->b->id}/restore")->assertOk();
    expect(($this->layout)())->toBe([['B'], ['C'], ['A']]);
});

it('ряд другого пространства — 422, чужие соседи и ряды игнорируются; доска остаётся в своём пространстве', function () {
    $other = space(['key' => 'OPS']);
    $stranger = member();
    addToSpace($other, $stranger, SpaceRole::Admin);
    $foreign = makeBoard($other, $stranger, name: 'Чужая');

    ($this->move)($this->a, ['row_id' => $foreign->row_id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['row_id' => __('selen.boards.row_not_found')]);

    ($this->move)($this->a, ['new_row_before_id' => $foreign->row_id])->assertOk();
    ($this->move)($this->b, ['after_id' => $foreign->id])->assertOk();

    expect(($this->layout)())->toBe([['C'], ['A'], ['B']])
        ->and($this->a->fresh()->row->space_id)->toBe($this->space->id)
        ->and(BoardRow::query()->where('space_id', $other->id)->count())->toBe(1);
});

it('проверяет запрос перестановки', function (array $data, string $field) {
    ($this->move)($this->a, $data)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'ряд и новый ряд вместе' => [['row_id' => '01k0000000000000000000000a', 'new_row_after_id' => null], 'row_id'],
    'ряд — не ulid' => [['row_id' => 'ряд'], 'row_id'],
    'новый ряд — не ulid' => [['new_row_before_id' => 'x'], 'new_row_before_id'],
]);

it('раскладку меняет только администратор пространства', function () {
    $editor = member();
    addToSpace($this->space, $editor, SpaceRole::Editor);

    $this->actingAs($editor)->postJson("/api/v1/boards/{$this->c->id}/move", ['row_id' => $this->a->row_id])->assertForbidden();
    $this->actingAs(member())->postJson("/api/v1/boards/{$this->c->id}/move", ['row_id' => $this->a->row_id])->assertNotFound();

    expect(($this->layout)())->toBe([['A'], ['B'], ['C']]);
});

it('дерево, список пространств и метрики — в порядке раскладки', function () {
    ($this->move)($this->c, ['row_id' => $this->a->row_id, 'before_id' => $this->a->id])->assertOk();
    ($this->move)($this->b, ['new_row_before_id' => $this->a->row_id])->assertOk();

    $this->actingAs($this->owner)->getJson('/api/v1/navigation')
        ->assertJsonPath('data.0.boards.*.name', ['B', 'C', 'A']);
    $this->actingAs($this->owner)->getJson('/api/v1/spaces')
        ->assertJsonPath('data.0.boards.*.name', ['B', 'C', 'A']);
    expect(Board::query()->where('space_id', $this->space->id)->inLayoutOrder()->pluck('name')->all())->toBe(['B', 'C', 'A']);
});

it('список досок: число листовых колонок, видимые карточки и личное сворачивание — без запросов на каждую доску', function () {
    $dev = makeBoard($this->space, $this->owner, BoardTemplate::Development, 'Разработка');
    // Подколонки: колонка первого уровня с подколонками сама не листовая; архивные не считаются
    $parent = columnNamed($dev, 'In Progress');
    foreach (['Текст', 'Дизайн'] as $name) {
        $this->actingAs($this->owner)->postJson("/api/v1/boards/{$dev->id}/columns", ['name' => $name, 'parent_id' => $parent->id])->assertCreated();
    }
    $this->actingAs($this->owner)->postJson('/api/v1/columns/'.columnNamed($dev, 'Testing')->id.'/archive')->assertOk();
    makeCard($this->a, 'To Do', $this->owner);
    makeCard($this->a, 'Done', $this->owner);
    makeCard($this->a, 'To Do', $this->owner)->forceFill(['archived_at' => now()])->save();
    $this->actingAs($this->owner)->putJson("/api/v1/boards/{$this->b->id}/collapsed")->assertNoContent();

    $boards = collect($this->actingAs($this->owner)->getJson('/api/v1/spaces/DEV/boards')->assertOk()->json('data'))->keyBy('name');

    // «Разработка»: 8 колонок, у In Progress две подколонки (+1 листовая), Testing в архиве (−1)
    expect($boards['Разработка']['leaf_columns_count'])->toBe(8)
        ->and($boards['A']['leaf_columns_count'])->toBe(4)
        ->and($boards['A']['cards_count'])->toBe(2)
        ->and($boards['B']['cards_count'])->toBe(0)
        ->and($boards['A']['collapsed'])->toBeFalse()
        ->and($boards['B']['collapsed'])->toBeTrue();

    $queries = function () {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->owner)->getJson('/api/v1/spaces/DEV/boards')->assertOk();
        DB::disableQueryLog();

        return count(DB::getQueryLog());
    };
    $queries();
    $before = $queries();
    foreach (range(1, 4) as $i) {
        makeCard(makeBoard($this->space, $this->owner, name: "Ещё {$i}"), 'Backlog', $this->owner);
    }
    expect($queries())->toBe($before);
});

it('«только свои карточки»: счётчик — только свои видимые карточки (ADR-0008)', function () {
    $restricted = member();
    addToSpace($this->space, $restricted, SpaceRole::Editor);
    SpaceMember::query()->where('space_id', $this->space->id)->where('user_id', $restricted->id)->update(['own_cards_only' => true]);
    makeCard($this->a, 'To Do', $this->owner, 'Чужая');
    makeCard($this->a, 'To Do', $restricted, 'Своя');

    $count = fn ($user) => collect($this->actingAs($user)->getJson('/api/v1/spaces/DEV/boards')->assertOk()->json('data'))
        ->firstWhere('name', 'A')['cards_count'];

    expect($count($restricted))->toBe(1)
        ->and($count($this->owner))->toBe(2);
});

it('удаление пустого пространства уносит ряды его досок', function () {
    $this->actingAs(admin())->deleteJson("/api/v1/admin/spaces/{$this->space->id}")->assertSuccessful();

    expect(BoardRow::query()->count())->toBe(0);
});
