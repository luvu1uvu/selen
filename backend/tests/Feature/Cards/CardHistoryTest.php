<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Label;
use App\Models\SpaceMember;
use Illuminate\Support\Carbon;

/*
| Лента истории карточки (этап 2c): перемещения из card_transitions и изменения из event_log по времени,
| новые сверху. Связанные карточки, которые зритель не видит, маскируются (ADR-0008).
*/

beforeEach(function () {
    $this->travelTo(Carbon::now('UTC')->addDay()->setTime(9, 0));
    $this->space = space(['key' => 'DEV']);
    $this->editor = member(['name' => 'Борис Редактор']);
    $this->other = member(['name' => 'Вера Исполнитель']);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->other, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor, 'Задача');        // DEV-1
    $this->blocker = makeCard($this->board, 'To Do', $this->editor, 'Секретная');  // DEV-2
});

/** Шаг времени: события ленты различаются по времени. */
function tick($test): void
{
    $test->travel(1)->minutes();
}

it('объединяет перемещения и изменения полей по времени, новые сверху', function () {
    $label = Label::query()->forceCreate(['space_id' => $this->space->id, 'name' => 'Бэкенд', 'color' => '#ff0000']);
    $as = $this->actingAs($this->editor);

    tick($this);
    $as->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $this->other->id, 'estimate_hours' => 6, 'title' => 'Новое'])->assertOk();
    tick($this);
    $as->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$label->id]])->assertOk();
    tick($this);
    $as->postJson('/api/v1/cards/DEV-1/blocks', ['reason' => 'Ждём доступы', 'blocking_card' => 'DEV-2'])->assertCreated();
    tick($this);
    $as->postJson('/api/v1/cards/DEV-1/move', [
        'column_id' => columnNamed($this->board, 'In Progress')->id, 'lane_id' => firstLane($this->board)->id,
    ])->assertOk();
    tick($this);
    $as->postJson('/api/v1/cards/DEV-1/relations', ['card' => 'DEV-2', 'kind' => 'child'])->assertOk();

    $response = $as->getJson('/api/v1/cards/DEV-1/history')->assertOk();
    $items = collect($response->json('data'));

    // Перемещения — только из card_transitions: card.created/moved/reordered в ленту не попадают
    expect($items->map(fn ($i) => $i['kind'] === 'transition' ? 'transition:'.$i['transition']['reason'] : $i['event_type'])->all())
        ->toBe([
            'card.relation_added',
            'card.participant_added',       // автоназначение при переходе (ответственный уже есть)
            'transition:manual',
            'card.blocked',
            'card.labels_changed',
            'card.updated',
            'transition:created',
        ]);

    $updated = $items->firstWhere('event_type', 'card.updated');
    expect($updated['actor'])->toBe(['id' => $this->editor->id, 'name' => 'Борис Редактор'])
        ->and($updated['payload']['changes']['responsible_id'])->toEqual(['from' => null, 'to' => $this->other->id])
        ->and($updated['payload']['changes']['estimate_hours'])->toEqual(['from' => null, 'to' => 6]);
    expect($items->firstWhere('event_type', 'card.blocked')['payload'])->toMatchArray(['blocking_card_id' => $this->blocker->id]);

    $response->assertJsonPath("refs.users.{$this->other->id}", 'Вера Исполнитель')
        ->assertJsonPath("refs.users.{$this->editor->id}", 'Борис Редактор')
        ->assertJsonPath("refs.labels.{$label->id}", ['name' => 'Бэкенд', 'color' => '#ff0000'])
        ->assertJsonPath("refs.cards.{$this->blocker->id}.key", 'DEV-2')
        ->assertJsonPath('refs.blocks.'.$items->firstWhere('event_type', 'card.blocked')['payload']['block_id'], 'Ждём доступы');

    $move = $items->firstWhere('kind', 'transition');
    expect($move['transition']['to_column']['name'])->toBe('In Progress')
        ->and($move['transition']['from_category'])->toBe('queue');
});

it('ранее существовавший GET …/transitions работает как прежде', function () {
    moveCard($this->card, 'Done', $this->editor);

    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/transitions')
        ->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.1.to_column.name', 'Done');
});

it('пользователь с ограничением: невидимая связанная карточка в ленте замаскирована', function () {
    $restricted = member();
    addToSpace($this->space, $restricted, SpaceRole::Editor);
    SpaceMember::query()->where('user_id', $restricted->id)->update(['own_cards_only' => true]);
    $this->card->forceFill(['responsible_id' => $restricted->id])->save();

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/blocks', ['blocking_card' => 'DEV-2'])->assertCreated();
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/relations', ['card' => 'DEV-2', 'kind' => 'parent'])->assertOk();
    moveCard($this->blocker, 'Done', $this->editor);

    $response = $this->actingAs($restricted)->getJson('/api/v1/cards/DEV-1/history')->assertOk();
    $events = collect($response->json('data'))->where('kind', 'event')->keyBy('event_type');

    expect($events['card.blocked']['payload']['blocking_card_id'])->toBe('hidden')
        ->and($events['card.unblocked']['payload']['blocking_card_id'])->toBe('hidden')
        ->and($events['card.relation_added']['payload']['card_id'])->toBe('hidden')
        ->and($response->json('refs.cards'))->toBe([])
        ->and($response->content())->not->toContain($this->blocker->id)->not->toContain('Секретная');

    // Ленту чужой карточки он не видит вовсе
    $this->actingAs($restricted)->getJson('/api/v1/cards/DEV-2/history')->assertNotFound();
});
