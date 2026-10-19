<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;

beforeEach(function () {
    $this->owner = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
    $this->url = "/api/v1/boards/{$this->board->id}";
});

it('добавляет, переименовывает и переставляет дорожки', function () {
    $main = firstLane($this->board);

    $urgent = $this->actingAs($this->owner)->postJson("{$this->url}/lanes", ['name' => 'Срочные', 'before_id' => $main->id])
        ->assertCreated()->json('data.id');
    $this->actingAs($this->owner)->patchJson("/api/v1/lanes/{$urgent}", ['name' => 'Срочно'])->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$urgent}/move", ['after_id' => $main->id])->assertOk();

    $this->actingAs($this->owner)->getJson($this->url)->assertJsonPath('data.lanes.*.name', ['Основная', 'Срочно']);
    expect(loggedEventTypes())->toContain('lane.created', 'lane.renamed', 'lane.moved');
});

it('дорожку с карточками и последнюю дорожку архивировать нельзя', function () {
    $main = firstLane($this->board);
    $card = makeCard($this->board, 'To Do', $this->owner);

    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$main->id}/archive")
        ->assertUnprocessable()->assertJsonPath('errors.lane.0', __('selen.lanes.has_cards'));

    $card->forceFill(['archived_at' => now()])->save();
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$main->id}/archive")
        ->assertUnprocessable()->assertJsonPath('errors.lane.0', __('selen.lanes.last_lane'));

    $second = $this->actingAs($this->owner)->postJson("{$this->url}/lanes", ['name' => 'Вторая'])->json('data.id');
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$main->id}/archive")->assertOk();
    $this->actingAs($this->owner)->postJson("/api/v1/lanes/{$main->id}/archive")->assertUnprocessable();

    $this->actingAs($this->owner)->getJson($this->url)->assertJsonPath('data.lanes.*.id', [$second]);
});
