<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация пространства: оно пропадает из навигации, содержимое доступно участникам только для чтения.
 */
class ArchiveSpaceAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Space $space): Space
    {
        return DB::transaction(function () use ($actor, $space) {
            $space = Space::query()->lockForUpdate()->findOrFail($space->id);

            if ($space->isArchived()) {
                throw ValidationException::withMessages(['space' => __('selen.spaces.already_archived')]);
            }

            $space->forceFill(['archived_at' => Date::now()])->save();
            $this->events->record(EventType::SpaceArchived, $actor, $space);

            return $space;
        });
    }
}
