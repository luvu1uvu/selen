<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Отзыв доступа группы: строка доступа удаляется, факт и прежняя роль — в журнале.
 * Инвариант «личный администратор» не затрагивается: администраторы через группы — дополнительные.
 */
class RevokeSpaceGroupAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(User $actor, Space $space, Group $group, ?string $via = null): void
    {
        DB::transaction(function () use ($actor, $space, $group, $via) {
            $space = $this->guard->lock($space);
            $grant = $space->groupGrants()->where('group_id', $group->id)->firstOrFail();
            $grant->delete();

            $this->events->record(EventType::SpaceGroupRemoved, $actor, $space, array_filter([
                'group_id' => $group->id,
                'role' => $grant->role->value,
                'via' => $via,
            ]));
        });
    }
}
