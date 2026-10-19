<?php

namespace App\Actions\Lanes;

use App\Enums\EventType;
use App\Models\Lane;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class RenameLaneAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Lane $lane, string $name): Lane
    {
        return DB::transaction(function () use ($actor, $lane, $name) {
            if ($lane->name === $name) {
                return $lane;
            }

            $lane->forceFill(['name' => $name])->save();
            $this->events->record(EventType::LaneRenamed, $actor, $lane, ['board_id' => $lane->board_id]);

            return $lane;
        });
    }
}
