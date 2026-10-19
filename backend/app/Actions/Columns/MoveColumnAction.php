<?php

namespace App\Actions\Columns;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/** Перестановка колонки среди соседей того же уровня (подколонки — внутри своего родителя). */
class MoveColumnAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, BoardColumn $column, ?string $afterId, ?string $beforeId): BoardColumn
    {
        return DB::transaction(function () use ($actor, $column, $afterId, $beforeId) {
            Board::query()->lockForUpdate()->findOrFail($column->board_id);

            // where('parent_id', null) — это IS NULL: колонки первого уровня
            $siblings = BoardColumn::query()
                ->where('board_id', $column->board_id)
                ->where('parent_id', $column->parent_id)
                ->whereKeyNot($column->id);

            $column->forceFill(['position' => $this->positions->place($siblings, $afterId, $beforeId)])->save();
            $this->events->record(EventType::ColumnMoved, $actor, $column, ['board_id' => $column->board_id]);

            return $column;
        });
    }
}
