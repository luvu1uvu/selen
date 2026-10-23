<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Отзыв доступа группы: выдача удаляется, факт и прежняя роль — в журнале.
 * Инвариант «личный администратор» не затрагивается: администраторы через группы — дополнительные.
 */
class RevokeSpaceGroupAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
        private readonly SpaceGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, Group $group, ?string $via = null): void
    {
        DB::transaction(function () use ($actor, $space, $group, $via) {
            $space = $this->guard->lock($space);
            $grant = $this->grants->ofGroup($space, $group) ?? throw (new ModelNotFoundException)->setModel(AccessGrant::class);

            $grant->delete();

            $this->events->record(EventType::SpaceGroupRemoved, $actor, $space, array_filter([
                'group_id' => $group->id,
                'role' => $grant->standardRole()->legacyRole()->value,
                'via' => $via,
            ]));
        });
    }
}
