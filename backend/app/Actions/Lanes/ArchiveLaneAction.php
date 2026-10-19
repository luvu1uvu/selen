<?php

namespace App\Actions\Lanes;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\Card;
use App\Models\Lane;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация дорожки — по тем же правилам, что колонки: с карточками нельзя.
 * Кроме того, у доски должна остаться хотя бы одна активная дорожка.
 */
class ArchiveLaneAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Lane $lane): Lane
    {
        return DB::transaction(function () use ($actor, $lane) {
            Board::query()->lockForUpdate()->findOrFail($lane->board_id);
            $lane = Lane::query()->findOrFail($lane->id);

            if ($lane->isArchived()) {
                throw ValidationException::withMessages(['lane' => __('selen.lanes.archived')]);
            }
            if (Card::query()->active()->where('lane_id', $lane->id)->exists()) {
                throw ValidationException::withMessages(['lane' => __('selen.lanes.has_cards')]);
            }
            if (! Lane::query()->active()->where('board_id', $lane->board_id)->whereKeyNot($lane->id)->exists()) {
                throw ValidationException::withMessages(['lane' => __('selen.lanes.last_lane')]);
            }

            $lane->forceFill(['archived_at' => Date::now()])->save();
            $this->events->record(EventType::LaneArchived, $actor, $lane, ['board_id' => $lane->board_id]);

            return $lane;
        });
    }
}
