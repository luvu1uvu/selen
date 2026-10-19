<?php

namespace App\Services\Cards;

use App\Enums\BlockEndReason;
use App\Enums\ColumnCategory;
use App\Enums\EventType;
use App\Enums\TransitionReason;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardTransition;
use App\Models\Lane;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Date;
use Illuminate\Validation\ValidationException;

/**
 * Единственная точка, которая меняет положение карточки (доска, колонка, дорожка) и её категорию.
 *
 * В той же транзакции: пишет переход в card_transitions (append-only), событие в журнал и пересчитывает
 * денормализованные поля карточки first_started_at / completed_at (docs/adr/0006-card-transitions.md).
 * Перестановка внутри той же ячейки — не переход: меняется только position.
 * Вход карточки в «готово» снимает блокировки, где она блокирующая (ADR-0011).
 *
 * Вызывать внутри DB::transaction().
 */
class CardPlacement
{
    public function __construct(
        private readonly Positioner $positions,
        private readonly EventRecorder $events,
    ) {}

    /** Поставить новую (ещё не сохранённую) карточку в ячейку. Первый переход: from = null. */
    public function create(Card $card, BoardColumn $column, Lane $lane, User $actor, ?string $afterId, ?string $beforeId): Card
    {
        $now = Date::now();
        $category = $column->effectiveCategory();

        $this->positions->lockCell($column->id, $lane->id);
        $card->forceFill([
            'board_id' => $column->board_id,
            'column_id' => $column->id,
            'lane_id' => $lane->id,
            'position' => $this->positions->place($this->cell($column->id, $lane->id), $afterId, $beforeId),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $this->applyFlowFields($card, null, $category, $now);
        $card->save();

        $this->recordTransition($card, null, $category, $actor, TransitionReason::Created, $now);

        return $card;
    }

    /**
     * Переместить карточку в ячейку (возможно, на другую доску того же пространства) или переставить
     * внутри ячейки. Возвращает true, если положение изменилось (записан переход).
     */
    public function move(
        Card $card,
        BoardColumn $column,
        Lane $lane,
        ?User $actor,
        ?string $afterId = null,
        ?string $beforeId = null,
        TransitionReason $reason = TransitionReason::Manual,
    ): bool {
        $now = Date::now();
        $from = $this->snapshot($card);
        $toCategory = $column->effectiveCategory();
        $sameCell = $card->column_id === $column->id && $card->lane_id === $lane->id;

        $this->positions->lockCell($column->id, $lane->id);
        $position = $this->positions->place($this->cell($column->id, $lane->id)->whereKeyNot($card->id), $afterId, $beforeId);

        $card->forceFill([
            'board_id' => $column->board_id,
            'column_id' => $column->id,
            'lane_id' => $lane->id,
            'position' => $position,
        ]);

        if ($sameCell) {
            $card->save();
            $this->events->record(EventType::CardReordered, $actor, $card, [
                'column_id' => $column->id,
                'lane_id' => $lane->id,
            ], $now);

            return false;
        }

        $this->applyFlowFields($card, $from['category'], $toCategory, $now);
        $card->save();
        $this->recordTransition($card, $from, $toCategory, $actor, $reason, $now);
        $this->releaseBlocksIfCompleted($card, $from['category'], $toCategory, $actor, $now);

        return true;
    }

    /** Колонке сменили тип: место карточки прежнее, категория — новая. */
    public function recategorize(Card $card, ColumnCategory $from, ColumnCategory $to, ?User $actor): void
    {
        $now = Date::now();
        $snapshot = [...$this->snapshot($card), 'category' => $from];

        $this->applyFlowFields($card, $from, $to, $now);
        $card->save();
        $this->recordTransition($card, $snapshot, $to, $actor, TransitionReason::ColumnTypeChanged, $now);
        $this->releaseBlocksIfCompleted($card, $from, $to, $actor, $now);
    }

    /**
     * Ячейка — активные карточки одной колонки и дорожки.
     *
     * @return Builder<Card>
     */
    public function cell(string $columnId, string $laneId)
    {
        return Card::query()->active()->where('column_id', $columnId)->where('lane_id', $laneId);
    }

    /**
     * Правила денормализации (повторяют CardFlowMetrics, но инкрементально):
     * first_started_at — первый вход в «в работе» или сразу в «готово», дальше не меняется;
     * completed_at — момент последнего входа в «готово», обнуляется при выходе из него.
     */
    private function applyFlowFields(Card $card, ?ColumnCategory $from, ColumnCategory $to, Carbon $at): void
    {
        if ($to->isStarted() && $card->first_started_at === null) {
            $card->first_started_at = $at;
        }

        if ($to !== ColumnCategory::Done) {
            $card->completed_at = null;
        } elseif ($from !== ColumnCategory::Done) {
            $card->completed_at = $at;
        }
    }

    /**
     * Автоснятие (как в Kaiten): блокирующая карточка вошла в «готово» — её активные блокировки закрываются
     * от имени переместившего (null — система). История эпизодов сохраняется (ADR-0011).
     */
    private function releaseBlocksIfCompleted(Card $card, ?ColumnCategory $from, ColumnCategory $to, ?User $actor, Carbon $at): void
    {
        if ($to !== ColumnCategory::Done || $from === ColumnCategory::Done) {
            return;
        }

        $this->releaseBlocksBy($card, BlockEndReason::BlockerCompleted, $actor, $at);
    }

    /**
     * Закрыть активные блокировки, где карточка — блокирующая: при входе в «готово» и при удалении в корзину
     * (ADR-0015). Эпизод закрывается (единственное разрешённое изменение), у заблокированной — card.unblocked.
     */
    public function releaseBlocksBy(Card $blocker, BlockEndReason $reason, ?User $actor, Carbon $at): void
    {
        $blocks = CardBlock::query()->active()->where('blocking_card_id', $blocker->id)
            ->with('card')->orderBy('started_at')->lockForUpdate()->get();

        foreach ($blocks as $block) {
            $block->forceFill([
                'ended_at' => $at,
                'ended_by' => $actor?->id,
                'end_reason' => $reason,
            ])->save();

            $this->events->record(EventType::CardUnblocked, $actor, $block->card, [
                'block_id' => $block->id,
                'blocking_card_id' => $blocker->id,
                'end_reason' => $reason->value,
            ], $at);
        }
    }

    /**
     * Вернуть карточку на доску — из архива или из корзины. Обратно в свою ячейку, в конец; если колонку или
     * дорожку тем временем архивировали (или колонку разбили на подколонки) — в первую листовую колонку и первую
     * дорожку доски: это перемещение пишется переходом. Поля archived_at / deleted_at сбрасывает вызывающий.
     */
    public function returnToBoard(Card $card, User $actor): void
    {
        // Пока карточка лежала в архиве или корзине, колонке могли сменить тип: сначала — переход «тип колонки
        // изменён» на прежнем месте (как у карточек на доске), иначе её метрики разошлись бы с колонкой
        $recorded = CardTransition::query()->withoutGlobalScope(CardTransition::OF_LIVE_CARDS)
            ->where('card_id', $card->id)->orderByDesc('moved_at')->orderByDesc('id')->first(['to_category'])?->to_category;
        $current = $this->snapshot($card)['category'];
        if ($recorded !== null && $recorded !== $current) {
            $this->recategorize($card, $recorded, $current, $actor);
        }

        [$column, $lane] = $this->returnTarget($card);

        if ($column->id === $card->column_id && $lane->id === $card->lane_id) {
            $this->positions->lockCell($column->id, $lane->id);
            $card->position = $this->positions->atEnd($this->cell($column->id, $lane->id)->whereKeyNot($card->id));
            $card->save();

            return;
        }

        $this->move($card, $column, $lane, $actor);
    }

    /** @return array{BoardColumn, Lane} */
    private function returnTarget(Card $card): array
    {
        $column = BoardColumn::query()->findOrFail($card->column_id);
        $lane = Lane::query()->findOrFail($card->lane_id);

        if (! $column->isArchived() && ! $column->hasActiveChildren() && ! $lane->isArchived()) {
            return [$column, $lane];
        }

        $first = BoardColumn::query()->active()->where('board_id', $card->board_id)->whereNull('parent_id')
            ->orderBy('position')
            ->with(['children' => fn ($q) => $q->active()->orderBy('position')])
            ->first();
        $column = $first?->children->first() ?? $first;
        $lane = Lane::query()->active()->where('board_id', $card->board_id)->orderBy('position')->first();

        if ($column === null || $lane === null) {
            throw ValidationException::withMessages(['card' => __('selen.cards.no_place_to_restore')]);
        }

        return [$column, $lane];
    }

    /**
     * Текущее положение карточки до изменения.
     *
     * @return array{board_id: string, column_id: string, lane_id: string, category: ColumnCategory}
     */
    private function snapshot(Card $card): array
    {
        $column = BoardColumn::query()->with('parent')->findOrFail($card->column_id);

        return [
            'board_id' => $card->board_id,
            'column_id' => $card->column_id,
            'lane_id' => $card->lane_id,
            'category' => $column->effectiveCategory(),
        ];
    }

    /**
     * @param  array{board_id: string, column_id: string, lane_id: string, category: ColumnCategory}|null  $from
     */
    private function recordTransition(
        Card $card,
        ?array $from,
        ColumnCategory $toCategory,
        ?User $actor,
        TransitionReason $reason,
        Carbon $at,
    ): void {
        $transition = CardTransition::query()->create([
            'card_id' => $card->id,
            'space_id' => $card->space_id,
            'from_board_id' => $from['board_id'] ?? null,
            'to_board_id' => $card->board_id,
            'from_column_id' => $from['column_id'] ?? null,
            'to_column_id' => $card->column_id,
            'from_lane_id' => $from['lane_id'] ?? null,
            'to_lane_id' => $card->lane_id,
            'from_category' => $from['category'] ?? null,
            'to_category' => $toCategory,
            'moved_at' => $at,
            'actor_id' => $actor?->id,
            'reason' => $reason,
        ]);

        if ($reason !== TransitionReason::Created) {
            $this->events->record(EventType::CardMoved, $actor, $card, [
                'transition_id' => $transition->id,
                'reason' => $reason->value,
                'from_board_id' => $transition->from_board_id,
                'to_board_id' => $transition->to_board_id,
                'from_column_id' => $transition->from_column_id,
                'to_column_id' => $transition->to_column_id,
                'from_lane_id' => $transition->from_lane_id,
                'to_lane_id' => $transition->to_lane_id,
                'from_category' => $transition->from_category?->value,
                'to_category' => $transition->to_category->value,
            ], $at);
        }
    }
}
