<?php

namespace App\Actions\Columns;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация колонки (вместе с её подколонками). Колонку с карточками архивировать нельзя,
 * пока карточки не перенесены. Восстановление архивных колонок — в backlog.
 */
class ArchiveColumnAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, BoardColumn $column): BoardColumn
    {
        return DB::transaction(function () use ($actor, $column) {
            Board::query()->lockForUpdate()->findOrFail($column->board_id);
            $column = BoardColumn::query()->findOrFail($column->id);

            if ($column->isArchived()) {
                throw ValidationException::withMessages(['column' => __('selen.columns.archived')]);
            }

            $columnIds = [$column->id, ...$column->children()->pluck('id')->all()];
            if (Card::query()->active()->whereIn('column_id', $columnIds)->exists()) {
                throw ValidationException::withMessages(['column' => __('selen.columns.has_cards')]);
            }

            BoardColumn::query()->whereIn('id', $columnIds)->whereNull('archived_at')->update(['archived_at' => Date::now()]);
            $this->events->record(EventType::ColumnArchived, $actor, $column, ['board_id' => $column->board_id]);

            return $column->refresh();
        });
    }
}
