<?php

namespace App\Actions\Columns;

use App\Enums\ColumnCategory;
use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Смена типа колонки первого уровня. Меняет статус всех карточек колонки и её подколонок:
 * по каждой карточке пишется переход с reason = column_type_changed (место прежнее, категория новая).
 * Уже записанные переходы не меняются — метрики прошлого остаются прежними.
 */
class ChangeColumnCategoryAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardPlacement $placement,
    ) {}

    /** @return int число карточек, у которых сменился статус */
    public function handle(User $actor, BoardColumn $column, ColumnCategory $category): int
    {
        if (! $column->isTopLevel()) {
            throw ValidationException::withMessages(['category' => __('selen.columns.subcolumn_has_no_category')]);
        }

        return DB::transaction(function () use ($actor, $column, $category) {
            Board::query()->lockForUpdate()->findOrFail($column->board_id);
            $column = BoardColumn::query()->lockForUpdate()->findOrFail($column->id);
            $from = $column->category;

            if ($from === $category || $from === null) {
                return 0;
            }

            $column->forceFill(['category' => $category])->save();

            $columnIds = [$column->id, ...$column->children()->pluck('id')->all()];
            $cards = Card::query()->active()->whereIn('column_id', $columnIds)->orderBy('id')->lockForUpdate()->get();

            foreach ($cards as $card) {
                $this->placement->recategorize($card, $from, $category, $actor);
            }

            $this->events->record(EventType::ColumnCategoryChanged, $actor, $column, [
                'board_id' => $column->board_id,
                'from' => $from->value,
                'to' => $category->value,
                'cards_affected' => $cards->count(),
            ]);

            return $cards->count();
        });
    }
}
