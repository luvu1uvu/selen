<?php

namespace App\Actions\Lanes;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\Lane;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

class MoveLaneAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Lane $lane, ?string $afterId, ?string $beforeId): Lane
    {
        return DB::transaction(function () use ($actor, $lane, $afterId, $beforeId) {
            Board::query()->lockForUpdate()->findOrFail($lane->board_id);

            $siblings = Lane::query()->where('board_id', $lane->board_id)->whereKeyNot($lane->id);
            $lane->forceFill(['position' => $this->positions->place($siblings, $afterId, $beforeId)])->save();
            $this->events->record(EventType::LaneMoved, $actor, $lane, ['board_id' => $lane->board_id]);

            return $lane;
        });
    }
}
