<?php

namespace App\Actions\Boards;

use App\Enums\BoardTemplate;
use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\BoardRow;
use App\Models\Lane;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use App\Support\FractionalIndex;
use Illuminate\Support\Facades\DB;

/**
 * Создание доски из шаблона: колонки шаблона + дорожка «Основная». Доска встаёт новым рядом внизу раскладки
 * пространства (ADR-0019, решение PM 5).
 */
class CreateBoardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    /**
     * @param  array{name: string, description?: string|null}  $data
     */
    public function handle(User $actor, Space $space, array $data, BoardTemplate $template): Board
    {
        return DB::transaction(function () use ($actor, $space, $data, $template) {
            // Доски пространства создаются и переставляются по очереди
            Space::query()->lockForUpdate()->findOrFail($space->id);

            $row = BoardRow::query()->create([
                'space_id' => $space->id,
                'position' => $this->positions->atEnd(BoardRow::query()->where('space_id', $space->id)),
            ]);
            $board = Board::query()->create([
                'space_id' => $space->id,
                'row_id' => $row->id,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'position' => FractionalIndex::between(null, null),
            ]);

            $columns = $template->columns();
            $positions = FractionalIndex::nBetween(null, null, count($columns));
            foreach ($columns as $i => [$name, $category]) {
                BoardColumn::query()->create([
                    'board_id' => $board->id,
                    'name' => $name,
                    'category' => $category,
                    'position' => $positions[$i],
                ]);
            }

            Lane::query()->create([
                'board_id' => $board->id,
                'name' => __('selen.boards.default_lane'),
                'position' => FractionalIndex::between(null, null),
            ]);

            $this->events->record(EventType::BoardCreated, $actor, $board, [
                'space_id' => $space->id,
                'template' => $template->value,
            ]);

            return $board;
        });
    }
}
