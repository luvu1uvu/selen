<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\CardRelation;
use App\Models\EventLogEntry;

/*
| Связи «родитель — дочерняя» (этап 2c): несколько родителей, только внутри пространства, без циклов,
| прогресс дочерних у родителя. Невидимая связанная карточка — «Скрытая карточка» (ADR-0008).
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->editor = member();
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->epic = makeCard($this->board, 'To Do', $this->editor, 'Эпик');            // DEV-1
    $this->task = makeCard($this->board, 'To Do', $this->editor, 'Задача');          // DEV-2
    $this->link = fn (string $card, string $other, string $kind, $user = null) => $this->actingAs($user ?? $this->editor)
        ->postJson("/api/v1/cards/{$card}/relations", ['card' => $other, 'kind' => $kind]);
});

it('связывает родителя и дочернюю; событие у обеих карточек', function () {
    ($this->link)('DEV-1', 'dev-2', 'child')
        ->assertOk()
        ->assertJsonPath('data.relations.children.0.card', [
            'hidden' => false, 'id' => $this->task->id, 'key' => 'DEV-2', 'title' => 'Задача', 'category' => 'queue', 'archived' => false,
        ])
        ->assertJsonPath('data.relations.parents', [])
        ->assertJsonPath('data.relations.progress', ['done' => 0, 'total' => 1]);

    $relation = CardRelation::query()->sole();
    expect($relation->parent_id)->toBe($this->epic->id)->and($relation->child_id)->toBe($this->task->id);

    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-2')
        ->assertJsonPath('data.relations.parents.0.card.key', 'DEV-1')
        ->assertJsonPath('data.relations.progress', null);

    $events = EventLogEntry::query()->where('event_type', 'card.relation_added')->orderBy('id')->get();
    expect($events)->toHaveCount(2)
        ->and($events[0]->subject_id)->toBe($this->epic->id)
        ->and($events[0]->payload)->toEqual(['relation_id' => $relation->id, 'kind' => 'child', 'card_id' => $this->task->id])
        ->and($events[1]->subject_id)->toBe($this->task->id)
        ->and($events[1]->payload)->toEqual(['relation_id' => $relation->id, 'kind' => 'parent', 'card_id' => $this->epic->id]);
});

it('у карточки может быть несколько родителей; прогресс — готовые из активных дочерних', function () {
    makeCard($this->board, 'To Do', $this->editor, 'Второй эпик');                // DEV-3
    ($this->link)('DEV-2', 'DEV-1', 'parent')->assertOk();
    ($this->link)('DEV-2', 'DEV-3', 'parent')->assertOk()->assertJsonCount(2, 'data.relations.parents');

    $done = makeCard($this->board, 'To Do', $this->editor, 'Готовая');            // DEV-4
    makeCard($this->board, 'To Do', $this->editor, 'В архиве');                   // DEV-5
    ($this->link)('DEV-1', 'DEV-4', 'child')->assertOk();
    ($this->link)('DEV-1', 'DEV-5', 'child')->assertOk();
    moveCard($done, 'Done', $this->editor);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-5/archive')->assertOk();

    // Архивная дочерняя остаётся в списке, но в прогресс не входит
    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')
        ->assertJsonCount(3, 'data.relations.children')
        ->assertJsonPath('data.relations.children.2.card.archived', true)
        ->assertJsonPath('data.relations.progress', ['done' => 1, 'total' => 2]);
});

it('проверяет вторую карточку', function (string $other, string $message) {
    $otherSpace = space(['key' => 'OPS']);
    addToSpace($otherSpace, $this->editor, SpaceRole::Editor);
    makeCard(makeBoard($otherSpace, $this->editor, BoardTemplate::Simple), 'To Do', $this->editor);
    makeCard($this->board, 'To Do', $this->editor);                               // DEV-3
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-3/archive')->assertOk();

    ($this->link)('DEV-1', $other, 'child')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['card' => $message]);
})->with([
    'нет такой' => ['DEV-99', 'Карточка не найдена.'],
    'другое пространство' => ['OPS-1', 'Карточка не найдена.'],
    'не номер' => ['что-то', 'Карточка не найдена.'],
    'сама с собой' => ['DEV-1', 'Нельзя связать карточку с самой собой.'],
    'архивная' => ['DEV-3', 'Карточка в архиве — связать с ней нельзя.'],
]);

it('не дублирует связь и не допускает циклов', function () {
    makeCard($this->board, 'To Do', $this->editor, 'Подзадача');                  // DEV-3
    ($this->link)('DEV-1', 'DEV-2', 'child')->assertOk();
    ($this->link)('DEV-2', 'DEV-3', 'child')->assertOk();

    ($this->link)('DEV-1', 'DEV-2', 'child')->assertJsonValidationErrors(['card' => 'Карточки уже связаны.']);
    ($this->link)('DEV-1', 'DEV-2', 'parent')->assertJsonValidationErrors(['card' => 'Карточки уже связаны.']);
    // DEV-1 → DEV-2 → DEV-3: DEV-3 не может стать родителем DEV-1
    ($this->link)('DEV-1', 'DEV-3', 'parent')
        ->assertJsonValidationErrors(['card' => 'Так получится цикл: карточка окажется родителем самой себя.']);
    ($this->link)('DEV-3', 'DEV-1', 'child')->assertJsonValidationErrors('card');
    // Ромб без цикла допустим
    ($this->link)('DEV-1', 'DEV-3', 'child')->assertOk();
    expect(CardRelation::query()->count())->toBe(3);
});

it('валидирует запрос; архивная карточка не меняется', function () {
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/relations', [])
        ->assertJsonValidationErrors(['card', 'kind']);
    ($this->link)('DEV-1', 'DEV-2', 'sibling')->assertJsonValidationErrors('kind');

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();
    ($this->link)('DEV-1', 'DEV-2', 'child')->assertJsonValidationErrors(['card' => 'Карточка в архиве.']);
});

it('убирает связь с любой стороны; чужую связь по адресу карточки — 404', function () {
    $relation = makeRelation($this->epic, $this->task, $this->editor);
    $other = makeRelation(makeCard($this->board, 'To Do', $this->editor), makeCard($this->board, 'To Do', $this->editor), $this->editor);

    $this->actingAs($this->editor)->deleteJson("/api/v1/cards/DEV-1/relations/{$other->id}")->assertNotFound();
    $this->actingAs($this->editor)->deleteJson("/api/v1/cards/DEV-2/relations/{$relation->id}")
        ->assertOk()->assertJsonPath('data.relations.parents', []);

    expect(CardRelation::query()->whereKey($relation->id)->exists())->toBeFalse()
        ->and(EventLogEntry::query()->where('event_type', 'card.relation_removed')->pluck('subject_id')->all())
        ->toEqualCanonicalizing([$this->epic->id, $this->task->id]);
});

describe('режим «только свои карточки»', function () {
    beforeEach(function () {
        $this->restricted = member();
        addToSpace($this->space, $this->restricted, SpaceRole::Editor);
        restrictToOwnCards($this->restricted);
        // Своя у него только DEV-1
        $this->epic->forceFill(['responsible_id' => $this->restricted->id])->save();
    });

    it('невидимая связанная карточка — «Скрытая карточка» без номера и названия', function () {
        makeRelation($this->epic, $this->task, $this->editor);
        moveCard($this->task, 'Done', $this->editor);

        $response = $this->actingAs($this->restricted)->getJson('/api/v1/cards/DEV-1')->assertOk()
            ->assertJsonPath('data.relations.children.0.card', ['hidden' => true])
            // Прогресс считается по всем дочерним: их и так видно в списке как скрытые
            ->assertJsonPath('data.relations.progress', ['done' => 1, 'total' => 1]);

        expect($response->content())->not->toContain('Задача')->not->toContain('DEV-2')->not->toContain($this->task->id);
    });

    it('связать можно только видимую карточку; связь со скрытой не убрать', function () {
        ($this->link)('DEV-1', 'DEV-2', 'child', $this->restricted)
            ->assertJsonValidationErrors(['card' => 'Карточка не найдена.']);

        $relation = makeRelation($this->epic, $this->task, $this->editor);
        $this->actingAs($this->restricted)->deleteJson("/api/v1/cards/DEV-1/relations/{$relation->id}")
            ->assertJsonValidationErrors(['relation' => 'Связь со скрытой карточкой может убрать только тот, кто её видит.']);

        // Карточка стала видна (он участник) — может
        $this->task->participants()->attach($this->restricted->id, ['created_at' => now()]);
        $this->actingAs($this->restricted)->deleteJson("/api/v1/cards/DEV-1/relations/{$relation->id}")->assertOk();
    });
});

it('в журнале связей нет персональных данных', function () {
    ($this->link)('DEV-1', 'DEV-2', 'child')->assertOk();

    expectNoPersonalDataInEventLog();
});
