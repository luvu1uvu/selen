<?php

use App\Actions\Columns\ChangeColumnCategoryAction;
use App\Actions\Columns\RenameColumnAction;
use App\Enums\BoardTemplate;
use App\Enums\ColumnCategory;
use App\Enums\SpaceRole;
use App\Enums\TransitionReason;
use App\Models\CardTransition;
use App\Services\Metrics\CardFlowMetrics;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;

/*
| Lead time = created_at → completed_at; cycle time = first_started_at → completed_at.
| Считаются только из card_transitions (ADR-0006). Время двигаем travelTo — так история
| получает реальные промежутки.
*/

beforeEach(function () {
    $this->user = member();
    $this->space = space(['key' => 'DEV']);
    addToSpace($this->space, $this->user, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->user, BoardTemplate::Development);
    $this->metrics = app(CardFlowMetrics::class);
    $this->start = Carbon::parse('2026-10-01 09:00:00', 'UTC');
});

function at($test, string $offset): void
{
    $test->travelTo($test->start->copy()->add($offset));
}

/** Денормализованные поля карточки совпадают с расчётом сервиса по истории. */
function expectDenormalizedMatches($test, $card): void
{
    $card = $card->fresh();
    $times = $test->metrics->forCard($card);

    expect($card->first_started_at?->toIso8601String())->toBe($times->firstStartedAt?->toIso8601String())
        ->and($card->completed_at?->toIso8601String())->toBe($times->completedAt?->toIso8601String())
        ->and($card->created_at->toIso8601String())->toBe($times->createdAt?->toIso8601String());
}

it('обычный путь: очередь → в работе → готово', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    at($this, '+2 hours');
    moveCard($card, 'In Progress', $this->user);
    at($this, '+1 day');
    moveCard($card, 'Code Review', $this->user);
    at($this, '+1 day 6 hours');
    moveCard($card, 'Done', $this->user);

    $times = $this->metrics->forCard($card);
    expect($times->leadTimeSeconds())->toBe(30 * 3600)
        ->and($times->cycleTimeSeconds())->toBe(28 * 3600);
    expectDenormalizedMatches($this, $card);
});

it('незавершённая карточка: метрик нет, начало работы зафиксировано', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    at($this, '+3 hours');
    moveCard($card, 'In Progress', $this->user);

    $times = $this->metrics->forCard($card);
    expect($times->leadTimeSeconds())->toBeNull()
        ->and($times->cycleTimeSeconds())->toBeNull()
        ->and($times->firstStartedAt?->equalTo($this->start->copy()->addHours(3)))->toBeTrue();
    expectDenormalizedMatches($this, $card);
});

it('возврат из «Готово» обнуляет завершение, повторное завершение даёт новое время', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    at($this, '+1 hour');
    moveCard($card, 'In Progress', $this->user);
    at($this, '+5 hours');
    moveCard($card, 'Done', $this->user);
    at($this, '+6 hours');
    moveCard($card, 'Code Review', $this->user);

    expect($this->metrics->forCard($card)->leadTimeSeconds())->toBeNull();
    expectDenormalizedMatches($this, $card);

    at($this, '+10 hours');
    moveCard($card, 'Done', $this->user);

    $times = $this->metrics->forCard($card);
    expect($times->leadTimeSeconds())->toBe(10 * 3600)
        ->and($times->cycleTimeSeconds())->toBe(9 * 3600);
    expectDenormalizedMatches($this, $card);
});

it('если «в работе» пропущена, начало работы — вход сразу в «готово»', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'Backlog', $this->user);
    at($this, '+4 hours');
    moveCard($card, 'Done', $this->user);

    $times = $this->metrics->forCard($card);
    expect($times->leadTimeSeconds())->toBe(4 * 3600)
        ->and($times->cycleTimeSeconds())->toBe(0);
    expectDenormalizedMatches($this, $card);
});

it('карточка, созданная сразу в «готово»: lead и cycle time — ноль', function () {
    $card = makeCard($this->board, 'Done', $this->user);

    expect($this->metrics->forCard($card)->leadTimeSeconds())->toBe(0);
    expectDenormalizedMatches($this, $card);
});

it('перемещение внутри «готово» не сдвигает момент завершения', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'In Progress', $this->user);
    at($this, '+2 hours');
    moveCard($card, 'Done', $this->user);
    // Вторая колонка «готово»
    app(ChangeColumnCategoryAction::class)->handle($this->user, columnNamed($this->board, 'Ready for Merge'), ColumnCategory::Done);
    at($this, '+5 hours');
    moveCard($card, 'Ready for Merge', $this->user);

    expect($this->metrics->forCard($card)->leadTimeSeconds())->toBe(2 * 3600);
    expectDenormalizedMatches($this, $card);
});

it('смена типа колонки: карточка завершается в момент смены', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    at($this, '+1 hour');
    moveCard($card, 'Code Review', $this->user);
    at($this, '+8 hours');
    app(ChangeColumnCategoryAction::class)->handle($this->user, columnNamed($this->board, 'Code Review'), ColumnCategory::Done);

    $times = $this->metrics->forCard($card);
    expect($times->leadTimeSeconds())->toBe(8 * 3600)
        ->and($times->cycleTimeSeconds())->toBe(7 * 3600);
    expectDenormalizedMatches($this, $card);

    // Обратная смена — карточка снова не завершена
    at($this, '+9 hours');
    app(ChangeColumnCategoryAction::class)->handle($this->user, columnNamed($this->board, 'Code Review'), ColumnCategory::InProgress);
    expect($this->metrics->forCard($card)->leadTimeSeconds())->toBeNull();
    expectDenormalizedMatches($this, $card);
});

it('переименование колонки и смена её типа не меняют записанную историю', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    at($this, '+1 hour');
    moveCard($card, 'Code Review', $this->user);
    at($this, '+3 hours');
    moveCard($card, 'Done', $this->user);

    $before = CardTransition::query()->orderBy('id')->get()->toArray();
    $timesBefore = $this->metrics->forCard($card);

    at($this, '+1 day');
    $review = columnNamed($this->board, 'Code Review');
    app(RenameColumnAction::class)->handle($this->user, $review, 'Ревью кода');
    app(ChangeColumnCategoryAction::class)->handle($this->user, $review, ColumnCategory::Queue);

    // Карточки в колонке нет — новых переходов не появилось, старые не изменились
    expect(CardTransition::query()->orderBy('id')->get()->toArray())->toEqual($before);
    $timesAfter = $this->metrics->forCard($card);
    expect($timesAfter->leadTimeSeconds())->toBe($timesBefore->leadTimeSeconds())
        ->and($timesAfter->cycleTimeSeconds())->toBe($timesBefore->cycleTimeSeconds())
        ->and($timesAfter->leadTimeSeconds())->toBe(3 * 3600);

    // В истории — снимок категории на момент перемещения, а не текущий тип колонки
    $intoReview = CardTransition::query()->where('to_column_id', $review->id)->sole();
    expect($intoReview->to_category->value)->toBe('in_progress');
});

it('card_transitions — append-only в модели', function () {
    makeCard($this->board, 'To Do', $this->user);
    $transition = CardTransition::query()->firstOrFail();

    $transition->reason = TransitionReason::Manual;
    expect(fn () => $transition->save())->toThrow(LogicException::class)
        ->and(fn () => $transition->delete())->toThrow(LogicException::class);
});

// Триггер — под владельцем схемы: у роли приложения на эти запросы нет и прав (Database/DatabaseRolesTest)
it('card_transitions — append-only в базе', function (string $sql) {
    expect(fn () => asOwner($sql))->toThrow(QueryException::class, 'card_transitions is append-only');
})->with([
    'UPDATE' => ["UPDATE card_transitions SET reason = 'manual'"],
    'DELETE' => ['DELETE FROM card_transitions'],
    'TRUNCATE' => ['TRUNCATE card_transitions'],
]);

it('момент перемещения — последний переход в другое место, без смены типа колонки', function () {
    at($this, '0 hours');
    $card = makeCard($this->board, 'To Do', $this->user);
    expect($this->metrics->forCard($card)->movedAt)->toBeNull();

    at($this, '+2 hours');
    moveCard($card, 'In Progress', $this->user);
    expect($this->metrics->forCard($card)->movedAt?->equalTo($this->start->copy()->addHours(2)))->toBeTrue();

    // Смена типа колонки пишет переход, но место карточки прежнее
    at($this, '+5 hours');
    app(ChangeColumnCategoryAction::class)->handle($this->user, columnNamed($this->board, 'In Progress'), ColumnCategory::Done);
    expect($this->metrics->forCard($card)->movedAt?->equalTo($this->start->copy()->addHours(2)))->toBeTrue();
});
