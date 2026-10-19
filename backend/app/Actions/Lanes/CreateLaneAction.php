<?php

namespace App\Actions\Lanes;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\Lane;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

class CreateLaneAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Board $board, string $name, ?string $afterId, ?string $beforeId): Lane
    {
        return DB::transaction(function () use ($actor, $board, $name, $afterId, $beforeId) {
            Board::query()->lockForUpdate()->findOrFail($board->id);

            $lane = Lane::query()->create([
                'board_id' => $board->id,
                'name' => $name,
                'position' => $this->positions->place(Lane::query()->where('board_id', $board->id), $afterId, $beforeId),
            ]);

            $this->events->record(EventType::LaneCreated, $actor, $lane, ['board_id' => $board->id]);

            return $lane;
        });
    }
}
