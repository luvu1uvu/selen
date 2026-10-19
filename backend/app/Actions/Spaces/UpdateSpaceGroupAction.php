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
 * Изменение доступа группы: роль и/или режим «только свои карточки» — атомарно.
 * При назначении admin ограничение снимается (отдельное событие с via: role_changed), как у участников.
 */
class UpdateSpaceGroupAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(
        User $actor,
        Space $space,
        Group $group,
        ?SpaceRole $role,
        ?bool $ownCardsOnly,
        ?string $via = null,
    ): SpaceGroup {
        return DB::transaction(function () use ($actor, $space, $group, $role, $ownCardsOnly, $via) {
            $space = $this->guard->lock($space);
            $grant = $space->groupGrants()->where('group_id', $group->id)->firstOrFail();
            $fromRole = $grant->role;
            $fromRestricted = $grant->own_cards_only;
            $toRole = $role ?? $fromRole;
            $toRestricted = $toRole->canManageSpace() ? false : ($ownCardsOnly ?? $fromRestricted);

            if ($group->isSystem() && $toRole->canManageSpace()) {
                throw ValidationException::withMessages(['role' => __('selen.groups.system_not_admin')]);
            }

            if ($ownCardsOnly === true && $toRole->canManageSpace()) {
                throw ValidationException::withMessages(['own_cards_only' => __('selen.spaces.admin_not_restricted')]);
            }

            $grant->forceFill(['role' => $toRole, 'own_cards_only' => $toRestricted])->save();

            if ($toRole !== $fromRole) {
                $this->events->record(EventType::SpaceGroupRoleChanged, $actor, $space, array_filter([
                    'group_id' => $group->id,
                    'from' => $fromRole->value,
                    'to' => $toRole->value,
                    'via' => $via,
                ]));
            }

            if ($toRestricted !== $fromRestricted) {
                // Снято назначением admin, а не явным выключением
                $roleCleared = $toRole->canManageSpace();
                $this->events->record(EventType::SpaceGroupRestrictionChanged, $actor, $space, array_filter([
                    'group_id' => $group->id,
                    'from' => $fromRestricted,
                    'to' => $toRestricted,
                    'via' => $roleCleared ? 'role_changed' : $via,
                ], fn ($value) => $value !== null));
            }

            return $grant;
        });
    }
}
