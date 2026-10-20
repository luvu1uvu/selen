<?php

namespace App\Actions\Boards;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardRow;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use App\Support\FractionalIndex;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Перестановка доски в раскладке её пространства (ADR-0019): в ряд между соседями, отдельным новым рядом между рядами
 * или (запрос без рядов, как до них) в ряд соседа рядом с ним. Перенос доски в другое пространство не поддерживается:
 * ряды и соседи берутся только из пространства доски, чужие игнорируются (ADR-0007). Ряд, где после переноса не
 * осталось ни одной доски (ни активной, ни архивной), удаляется: это служебная запись раскладки, не данные.
 */
class MoveBoardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    /**
     * @param  string|null  $rowId  ряд, куда поставить доску (соседи after/before — доски этого ряда)
     * @param  bool  $newRow  отдельным новым рядом между рядами newRowAfterId и newRowBeforeId
     */
    public function handle(
        User $actor,
        Board $board,
        ?string $afterId,
        ?string $beforeId,
        ?string $rowId = null,
        bool $newRow = false,
        ?string $newRowAfterId = null,
        ?string $newRowBeforeId = null,
    ): Board {
        return DB::transaction(function () use ($actor, $board, $afterId, $beforeId, $rowId, $newRow, $newRowAfterId, $newRowBeforeId) {
            // Раскладка пространства меняется по очереди (как создание доски)
            Space::query()->lockForUpdate()->findOrFail($board->space_id);
            $board = Board::query()->findOrFail($board->id);
            $rows = BoardRow::query()->where('space_id', $board->space_id);
            $previousRowId = $board->row_id;

            if ($newRow) {
                $row = BoardRow::query()->create([
                    'space_id' => $board->space_id,
                    'position' => $this->positions->place($rows, $newRowAfterId, $newRowBeforeId),
                ]);
                $position = FractionalIndex::between(null, null);
            } else {
                $row = $rowId !== null
                    ? (clone $rows)->find($rowId) ?? throw ValidationException::withMessages(['row_id' => __('selen.boards.row_not_found')])
                    : $this->neighbourRow($board, $afterId, $beforeId);
                if ($row !== null) {
                    $siblings = Board::query()->where('row_id', $row->id)->whereKeyNot($board->id);
                    $position = $this->positions->place($siblings, $afterId, $beforeId);
                } else {
                    // Запрос без рядов, сосед не найден — новым рядом внизу (как раньше — в конец списка)
                    $row = BoardRow::query()->create([
                        'space_id' => $board->space_id,
                        'position' => $this->positions->atEnd($rows),
                    ]);
                    $position = FractionalIndex::between(null, null);
                }
            }

            $board->forceFill(['row_id' => $row->id, 'position' => $position])->save();

            if ($previousRowId !== $row->id && Board::query()->where('row_id', $previousRowId)->doesntExist()) {
                BoardRow::query()->whereKey($previousRowId)->delete();
            }

            $this->events->record(EventType::BoardMoved, $actor, $board, ['row_id' => $row->id]);

            return $board;
        });
    }

    /** Запрос без рядов (как до них): ряд доски-соседа из того же пространства — after_id, иначе before_id. */
    private function neighbourRow(Board $board, ?string $afterId, ?string $beforeId): ?BoardRow
    {
        foreach ([$afterId, $beforeId] as $id) {
            $neighbour = $id === null ? null : Board::query()
                ->where('space_id', $board->space_id)
                ->whereKeyNot($board->id)
                ->find($id);
            if ($neighbour !== null) {
                return $neighbour->row;
            }
        }

        return null;
    }
}
