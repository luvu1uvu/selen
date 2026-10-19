<?php

namespace App\Actions\Boards;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class UpdateBoardAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, description?: string|null, auto_assign_on_move?: bool}  $data
     */
    public function handle(User $actor, Board $board, array $data): Board
    {
        return DB::transaction(function () use ($actor, $board, $data) {
            $board->fill($data);
            $fields = array_keys($board->getDirty());

            if ($fields === []) {
                return $board;
            }

            sort($fields);
            $board->save();
            $this->events->record(EventType::BoardUpdated, $actor, $board, ['fields' => $fields]);

            return $board;
        });
    }
}
