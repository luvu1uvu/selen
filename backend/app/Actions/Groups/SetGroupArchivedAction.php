<?php

namespace App\Actions\Groups;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация и восстановление группы. Архивная группа доступа не даёт, но её состав и доступы
 * к пространствам сохраняются: восстановление возвращает доступ как было (ADR-0012).
 */
class SetGroupArchivedAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Group $group, bool $archived): Group
    {
        return DB::transaction(function () use ($actor, $group, $archived) {
            $group = Group::query()->lockForUpdate()->findOrFail($group->id);

            if ($group->isSystem()) {
                throw ValidationException::withMessages(['group' => __('selen.groups.system_not_archivable')]);
            }

            if ($group->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'group' => __($archived ? 'selen.groups.already_archived' : 'selen.groups.not_archived'),
                ]);
            }

            $group->forceFill(['archived_at' => $archived ? Date::now() : null])->save();
            $this->events->record($archived ? EventType::GroupArchived : EventType::GroupRestored, $actor, $group);

            return $group;
        });
    }
}
