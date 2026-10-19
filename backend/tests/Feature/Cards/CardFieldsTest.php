<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\EventLogEntry;

/*
| Поля карточки: срок (дата или дата со временем), «Срочно», оценка в часах (шаг 0,5).
| В журнал — значения было/стало.
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->editor = member();
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
    $this->patch = fn (array $data) => $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', $data);
});

/** @return array<string, mixed> */
function lastCardChanges(): array
{
    return EventLogEntry::query()->where('event_type', 'card.updated')->orderByDesc('id')->firstOrFail()->payload['changes'];
}

it('срок — дата без времени или момент в UTC; новое значение заменяет другое', function () {
    ($this->patch)(['due_date' => '2026-10-20'])
        ->assertOk()
        ->assertJsonPath('data.due_date', '2026-10-20')
        ->assertJsonPath('data.due_at', null);
    expect(lastCardChanges())->toEqual(['due_date' => ['from' => null, 'to' => '2026-10-20']]);

    // Время пользователя (+03:00) хранится и отдаётся в UTC
    ($this->patch)(['due_at' => '2026-10-21T18:30:00+03:00'])
        ->assertOk()
        ->assertJsonPath('data.due_at', '2026-10-21T15:30:00Z')
        ->assertJsonPath('data.due_date', null);
    expect(lastCardChanges())->toEqual([
        'due_date' => ['from' => '2026-10-20', 'to' => null],
        'due_at' => ['from' => null, 'to' => '2026-10-21T15:30:00Z'],
    ]);

    ($this->patch)(['due_at' => null])->assertOk()->assertJsonPath('data.due_at', null);
});

it('срок: нельзя одновременно дату и момент, формат проверяется', function () {
    ($this->patch)(['due_date' => '2026-10-20', 'due_at' => '2026-10-21T10:00:00Z'])
        ->assertUnprocessable()->assertJsonValidationErrors('due_date');
    ($this->patch)(['due_date' => '20.10.2026'])->assertUnprocessable()->assertJsonValidationErrors('due_date');
    ($this->patch)(['due_at' => 'завтра'])->assertUnprocessable()->assertJsonValidationErrors('due_at');
});

it('«Срочно» — флаг', function () {
    ($this->patch)(['is_urgent' => true])->assertOk()->assertJsonPath('data.is_urgent', true);
    expect(lastCardChanges())->toEqual(['is_urgent' => ['from' => false, 'to' => true]]);

    ($this->patch)(['is_urgent' => 'да'])->assertUnprocessable()->assertJsonValidationErrors('is_urgent');
});

it('оценка в часах — шаг 0,5, не отрицательная', function () {
    ($this->patch)(['estimate_hours' => 6])->assertOk()->assertJsonPath('data.estimate_hours', 6);
    ($this->patch)(['estimate_hours' => 2.5])->assertOk()->assertJsonPath('data.estimate_hours', 2.5);
    expect(lastCardChanges())->toEqual(['estimate_hours' => ['from' => 6.0, 'to' => 2.5]]);

    foreach ([0.3, -1, 10000, 'много'] as $wrong) {
        ($this->patch)(['estimate_hours' => $wrong])->assertUnprocessable()->assertJsonValidationErrors('estimate_hours');
    }

    ($this->patch)(['estimate_hours' => null])->assertOk()->assertJsonPath('data.estimate_hours', null);
});

it('повторная отправка тех же значений не пишет событие', function () {
    ($this->patch)(['is_urgent' => true, 'estimate_hours' => 4, 'due_date' => '2026-10-20'])->assertOk();
    ($this->patch)(['is_urgent' => true, 'estimate_hours' => '4.0', 'due_date' => '2026-10-20'])->assertOk();

    expect(EventLogEntry::query()->where('event_type', 'card.updated')->count())->toBe(1);
});

it('поля карточки видны на фасаде доски', function () {
    ($this->patch)(['due_date' => '2026-10-20', 'is_urgent' => true, 'responsible_id' => $this->editor->id])->assertOk();

    $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")
        ->assertOk()
        ->assertJsonPath('data.cards.0.due_date', '2026-10-20')
        ->assertJsonPath('data.cards.0.is_urgent', true)
        ->assertJsonPath('data.cards.0.responsible_id', $this->editor->id)
        ->assertJsonPath('data.cards.0.completed_at', null)
        ->assertJsonPath('data.people.0', ['id' => $this->editor->id, 'name' => $this->editor->name, 'status' => 'active']);
});
