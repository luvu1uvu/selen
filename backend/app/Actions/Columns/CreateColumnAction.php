<?php

namespace App\Actions\Columns;

use App\Enums\ColumnCategory;
use App\Enums\EventType;
use App\Enums\TransitionReason;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Новая колонка или подколонка.
 *
 * Если у колонки появляется первая подколонка, а в самой колонке были карточки — они переезжают
 * в эту подколонку (карточки лежат только в «листовых» колонках). Каждый переезд — переход
 * с reason = column_split; категория не меняется (подколонка наследует тип родителя).
 */
class CreateColumnAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
        private readonly CardPlacement $placement,
    ) {}

    public function handle(
        User $actor,
        Board $board,
        string $name,
        ?ColumnCategory $category,
        ?BoardColumn $parent,
        ?string $afterId,
        ?string $beforeId,
    ): BoardColumn {
        return DB::transaction(function () use ($actor, $board, $name, $category, $parent, $afterId, $beforeId) {
            Board::query()->lockForUpdate()->findOrFail($board->id);

            if ($parent !== null) {
                if (! $parent->isTopLevel()) {
                    throw ValidationException::withMessages(['parent_id' => __('selen.columns.too_deep')]);
                }
                if ($category !== null) {
                    throw ValidationException::withMessages(['category' => __('selen.columns.subcolumn_has_no_category')]);
                }
                $parentWasLeaf = ! $parent->hasActiveChildren();
                $siblings = BoardColumn::query()->where('parent_id', $parent->id);
            } else {
                if ($category === null) {
                    throw ValidationException::withMessages(['category' => __('selen.columns.category_required')]);
                }
                $parentWasLeaf = false;
                $siblings = BoardColumn::query()->where('board_id', $board->id)->whereNull('parent_id');
            }

            $column = BoardColumn::query()->create([
                'board_id' => $board->id,
                'parent_id' => $parent?->id,
                'name' => $name,
                'category' => $category,
                'position' => $this->positions->place($siblings, $afterId, $beforeId),
            ]);

            $this->events->record(EventType::ColumnCreated, $actor, $column, array_filter([
                'board_id' => $board->id,
                'parent_id' => $parent?->id,
                'category' => $category?->value,
            ]));

            if ($parent !== null && $parentWasLeaf) {
                $this->moveCardsIntoFirstSubcolumn($actor, $parent, $column);
            }

            return $column;
        });
    }

    private function moveCardsIntoFirstSubcolumn(User $actor, BoardColumn $parent, BoardColumn $column): void
    {
        $cards = Card::query()
            ->active()
            ->where('column_id', $parent->id)
            ->orderBy('lane_id')
            ->orderBy('position')
            ->with('lane')
            ->lockForUpdate()
            ->get();

        // По порядку в конец новой ячейки — порядок карточек в каждой дорожке сохраняется
        foreach ($cards as $card) {
            $this->placement->move($card, $column, $card->lane, $actor, reason: TransitionReason::ColumnSplit);
        }
    }
}
