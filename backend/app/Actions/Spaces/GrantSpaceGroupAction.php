<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\Group;
use App\Models\Space;
use App\Models\SpaceGroup;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Выдача доступа группе: роль и режим «только свои карточки» для всех её участников (ADR-0012).
 * $via — как у участников: null (из пространства) или admin_panel (системный администратор).
 */
class GrantSpaceGroupAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(
        User $actor,
        Space $space,
        Group $group,
        SpaceRole $role,
        bool $ownCardsOnly = false,
        ?string $via = null,
    ): SpaceGroup {
        return DB::transaction(function () use ($actor, $space, $group, $role, $ownCardsOnly, $via) {
            $space = $this->guard->lock($space);

            if ($group->isArchived()) {
                throw ValidationException::withMessages(['group_id' => __('selen.groups.archived')]);
            }

            if ($space->groupGrants()->where('group_id', $group->id)->exists()) {
                throw ValidationException::withMessages(['group_id' => __('selen.groups.already_granted')]);
            }

            if ($group->isSystem() && $role->canManageSpace()) {
                throw ValidationException::withMessages(['role' => __('selen.groups.system_not_admin')]);
            }

            if ($ownCardsOnly && $role->canManageSpace()) {
                throw ValidationException::withMessages(['own_cards_only' => __('selen.spaces.admin_not_restricted')]);
            }

            $grant = SpaceGroup::query()->create([
                'space_id' => $space->id,
                'group_id' => $group->id,
                'role' => $role,
                'own_cards_only' => $ownCardsOnly,
            ]);

            $this->events->record(EventType::SpaceGroupAdded, $actor, $space, array_filter([
                'group_id' => $group->id,
                'role' => $role->value,
                'own_cards_only' => $ownCardsOnly,
                'via' => $via,
            ], fn ($value) => $value !== null));

            return $grant;
        });
    }
}
