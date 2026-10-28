<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Смена роли участника. Администратор пространства видит всё, поэтому при назначении admin
 * режим «только свои карточки» снимается (отдельное событие в журнале). Роль + флаг API — стандартная роль
 * личной выдачи (ADR-0024).
 */
class ChangeSpaceMemberRoleAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
        private readonly SpaceGrants $grants,
        private readonly AccessResolver $resolver,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role, ?string $via = null): AccessGrant
    {
        return DB::transaction(function () use ($actor, $space, $user, $role, $via) {
            $space = $this->guard->lock($space);
            $grant = $this->grants->personal($space, $user) ?? throw (new ModelNotFoundException)->setModel(AccessGrant::class);
            $current = $this->grants->standardRoleOf($grant);
            $from = $current->legacyRole();

            if ($from === $role) {
                return $grant;
            }

            // Гостю — только роли без «управления доступом» (ADR-0024)
            if ($role->canManageSpace() && $this->resolver->isGuest($space->company_id, $user)) {
                throw ValidationException::withMessages(['role' => __('selen.guests.no_manage_access')]);
            }

            if ($this->guard->managesAccess($grant)) {
                $this->guard->ensureAnotherAdminRemains($space, $user);
            }

            $wasRestricted = $current->ownCardsOnly();
            $grant = $this->grants->changeRole($grant, StandardRole::fromLegacy($role, ! $role->canManageSpace() && $wasRestricted));

            $this->events->record(EventType::SpaceMemberRoleChanged, $actor, $space, array_filter([
                'user_id' => $user->id,
                'from' => $from->value,
                'to' => $role->value,
                'via' => $via,
            ]));

            if ($wasRestricted && ! $grant->ownCardsOnly()) {
                $this->events->record(EventType::SpaceMemberRestrictionChanged, $actor, $space, [
                    'user_id' => $user->id,
                    'from' => true,
                    'to' => false,
                    'via' => 'role_changed',
                ]);
            }

            return $grant;
        });
    }
}
