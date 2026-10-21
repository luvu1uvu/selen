<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Space;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/*
| Личное сворачивание досок на странице пространства (docs/adr/0019-board-and-space-layout.md): вид, а не доступ
| и не данные.
*/

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->owner, BoardTemplate::Simple, 'Продукт');
    $this->other = makeBoard($this->space, $this->owner, BoardTemplate::Simple, 'Инфраструктура');
    $this->viewer = member();
    addToSpace($this->space, $this->viewer, SpaceRole::Commenter);
    $this->collapsed = fn ($user) => collect($this->actingAs($user)->getJson('/api/v1/spaces/DEV/boards')->assertOk()->json('data'))
        ->where('collapsed', true)->pluck('name')->all();
});

it('сворачивает и разворачивает доску; повтор безопасен', function () {
    expect(($this->collapsed)($this->viewer))->toBe([]);

    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();
    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();
    expect(($this->collapsed)($this->viewer))->toBe(['Продукт'])
        ->and(DB::table('collapsed_boards')->count())->toBe(1);

    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->other->id}/collapsed")->assertNoContent();
    expect(($this->collapsed)($this->viewer))->toBe(['Продукт', 'Инфраструктура']);

    $this->actingAs($this->viewer)->deleteJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();
    $this->actingAs($this->viewer)->deleteJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();
    expect(($this->collapsed)($this->viewer))->toBe(['Инфраструктура']);
});

it('сворачивание личное: у другого пользователя доска развёрнута', function () {
    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();

    expect(($this->collapsed)($this->owner))->toBe([])
        ->and(($this->collapsed)($this->viewer))->toBe(['Продукт']);
});

it('доску чужого пространства свернуть нельзя — 404', function () {
    $stranger = member();

    $this->actingAs($stranger)->putJson("/api/v1/boards/{$this->board->id}/collapsed")
        ->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->actingAs($stranger)->deleteJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNotFound();
    expect(DB::table('collapsed_boards')->count())->toBe(0);
});

it('архивную доску и доску архивного пространства свернуть можно — это только вид', function () {
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$this->board->id}/archive")->assertOk();
    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();

    Space::query()->whereKey($this->space->id)->update(['archived_at' => now()]);
    $this->actingAs($this->viewer)->deleteJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();
});

it('не меняет ни ответ доски, ни счётчик, ни поиск, ни метрики и не пишет журнал', function () {
    makeCard($this->board, 'To Do', $this->owner, 'Первая');
    moveCard(makeCard($this->board, 'To Do', $this->owner, 'Вторая'), 'Done', $this->owner);

    $snapshot = function () {
        $boards = $this->actingAs($this->viewer)->getJson('/api/v1/spaces/DEV/boards')->assertOk()->json('data');
        Artisan::call('app:flow-metrics', ['space' => 'DEV', '--days' => 30]);

        return [
            'board' => $this->actingAs($this->viewer)->getJson("/api/v1/boards/{$this->board->id}")->assertOk()->json('data'),
            'boards' => array_map(fn (array $board) => array_diff_key($board, ['collapsed' => true]), $boards),
            'search' => $this->actingAs($this->viewer)->getJson('/api/v1/spaces/DEV/cards?search=')->assertOk()->json(),
            'metrics' => Artisan::output(),
            'events' => DB::table('event_log')->count(),
        ];
    };

    $before = $snapshot();
    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();

    expect($snapshot())->toEqual($before)
        ->and($before['board']['cards'])->toHaveCount(2)
        ->and(collect($before['boards'])->firstWhere('name', 'Продукт')['cards_count'])->toBe(2);
});

it('удаление пустого пространства уносит строки сворачивания его досок', function () {
    $this->actingAs($this->viewer)->putJson("/api/v1/boards/{$this->board->id}/collapsed")->assertNoContent();

    $this->actingAs(admin())->deleteJson("/api/v1/admin/spaces/{$this->space->id}")->assertSuccessful();

    expect(DB::table('collapsed_boards')->count())->toBe(0);
});
