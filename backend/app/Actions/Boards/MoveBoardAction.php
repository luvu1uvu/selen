<?php

namespace App\Actions\Boards;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/**
 * Перестановка доски внутри её пространства. Перенос доски в другое пространство не поддерживается
 * (вне scope): соседи берутся только из пространства доски.
 */
class MoveBoardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Board $board, ?string $afterId, ?string $beforeId): Board
    {
        return DB::transaction(function () use ($actor, $board, $afterId, $beforeId) {
            Space::query()->lockForUpdate()->findOrFail($board->space_id);

            $siblings = Board::query()->where('space_id', $board->space_id)->whereKeyNot($board->id);
            $board->forceFill(['position' => $this->positions->place($siblings, $afterId, $beforeId)])->save();

            $this->events->record(EventType::BoardMoved, $actor, $board);

            return $board;
        });
    }
}
