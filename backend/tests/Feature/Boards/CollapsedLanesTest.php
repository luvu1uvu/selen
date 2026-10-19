<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Lane;
use App\Models\Space;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/*
| Личное сворачивание дорожек (docs/adr/0019-board-and-space-layout.md): вид, а не доступ и не данные.
*/

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
    $this->main = firstLane($this->board);
    $this->urgent = $this->actingAs($this->owner)
        ->postJson("/api/v1/boards/{$this->board->id}/lanes", ['name' => 'Срочные'])->json('data.id');
    $this->viewer = member();
    addToSpace($this->space, $this->viewer, SpaceRole::Commenter);
    $this->collapsed = fn ($user) => $this->actingAs($user)->getJson("/api/v1/boards/{$this->board->id}")
        ->assertOk()->json('data.collapsed_lane_ids');
});

it('сворачивает и разворачивает дорожку; повтор безопасен', function () {
    expect(($this->collapsed)($this->viewer))->toBe([]);

    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    expect(($this->collapsed)($this->viewer))->toBe([$this->urgent])
        ->and(DB::table('collapsed_lanes')->count())->toBe(1);

    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->main->id}/collapsed")->assertNoContent();
    // По порядку дорожек на доске
    expect(($this->collapsed)($this->viewer))->toBe([$this->main->id, $this->urgent]);

    $this->actingAs($this->viewer)->deleteJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    $this->actingAs($this->viewer)->deleteJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    expect(($this->collapsed)($this->viewer))->toBe([$this->main->id]);
});

it('сворачивание личное: у другого пользователя дорожка развёрнута', function () {
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();

    expect(($this->collapsed)($this->owner))->toBe([])
        ->and(($this->collapsed)($this->viewer))->toBe([$this->urgent]);
});

it('дорожку чужой доски свернуть нельзя — 404', function () {
    $other = space(['key' => 'OPS']);
    $stranger = member();
    addToSpace($other, $stranger, SpaceRole::Admin);

    $this->actingAs($stranger)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")
        ->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->actingAs($stranger)->deleteJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNotFound();
    expect(DB::table('collapsed_lanes')->count())->toBe(0);
});

it('архивную дорожку свернуть нельзя — 404', function () {
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$this->urgent}/archive")->assertOk();

    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")
        ->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->actingAs($this->viewer)->deleteJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNotFound();
});

it('в архивной доске и архивном пространстве свернуть можно — это только вид', function () {
    $this->actingAs($this->owner)->postJson("/api/v1/boards/{$this->board->id}/archive")->assertOk();
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();

    Space::query()->whereKey($this->space->id)->update(['archived_at' => now()]);
    $this->actingAs($this->viewer)->deleteJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
});

it('архивная дорожка не попадает в collapsed_lane_ids', function () {
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$this->urgent}/archive")->assertOk();

    expect(($this->collapsed)($this->viewer))->toBe([]);
});

it('не меняет ни ответ доски, ни поиск, ни метрики и не пишет журнал', function () {
    makeCard($this->board, 'To Do', $this->owner, 'Первая');
    moveCard(makeCard($this->board, 'To Do', $this->owner, 'Вторая', lane: Lane::query()->findOrFail($this->urgent)), 'Done', $this->owner);

    $snapshot = function () {
        $board = $this->actingAs($this->viewer)->getJson("/api/v1/boards/{$this->board->id}")->assertOk()->json('data');
        unset($board['collapsed_lane_ids']);
        Artisan::call('app:flow-metrics', ['space' => 'DEV', '--days' => 30]);

        return [
            'board' => $board,
            'search' => $this->actingAs($this->viewer)->getJson('/api/v1/spaces/DEV/cards?search=')->assertOk()->json(),
            'metrics' => Artisan::output(),
            'events' => DB::table('event_log')->count(),
        ];
    };

    $before = $snapshot();
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->main->id}/collapsed")->assertNoContent();

    expect($snapshot())->toEqual($before)
        ->and($before['board']['cards'])->toHaveCount(2);
});

it('удаление пустого пространства уносит строки сворачивания его дорожек', function () {
    $this->actingAs($this->viewer)->putJson("/api/v1/lanes/{$this->urgent}/collapsed")->assertNoContent();

    $this->actingAs(admin())->deleteJson("/api/v1/admin/spaces/{$this->space->id}")->assertSuccessful();

    expect(DB::table('collapsed_lanes')->count())->toBe(0);
});
