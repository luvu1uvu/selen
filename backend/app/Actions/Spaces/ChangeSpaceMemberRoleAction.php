<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Смена роли участника. Администратор пространства видит всё, поэтому при назначении admin
 * режим «только свои карточки» снимается (отдельное событие в журнале).
 */
class ChangeSpaceMemberRoleAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role, ?string $via = null): SpaceMember
    {
        return DB::transaction(function () use ($actor, $space, $user, $role, $via) {
            $space = $this->guard->lock($space);
            $member = $space->members()->where('user_id', $user->getKey())->firstOrFail();
            $from = $member->role;

            if ($from === $role) {
                return $member;
            }

            if ($from === SpaceRole::Admin) {
                $this->guard->ensureAnotherAdminRemains($space, $user);
            }

            $wasRestricted = $member->own_cards_only;
            $member->role = $role;
            if ($role->canManageSpace()) {
                $member->own_cards_only = false;
            }
            $member->save();

            $this->events->record(EventType::SpaceMemberRoleChanged, $actor, $space, array_filter([
                'user_id' => $user->id,
                'from' => $from->value,
                'to' => $role->value,
                'via' => $via,
            ]));

            if ($wasRestricted && ! $member->own_cards_only) {
                $this->events->record(EventType::SpaceMemberRestrictionChanged, $actor, $space, [
                    'user_id' => $user->id,
                    'from' => true,
                    'to' => false,
                    'via' => 'role_changed',
                ]);
            }

            return $member;
        });
    }
}
