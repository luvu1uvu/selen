<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Изменение участника из панели пространства: роль и/или режим «только свои карточки» — атомарно. */
class UpdateSpaceMemberAction
{
    public function __construct(
        private readonly ChangeSpaceMemberRoleAction $changeRole,
        private readonly SetSpaceMemberRestrictionAction $setRestriction,
    ) {}

    public function handle(User $actor, Space $space, User $user, ?SpaceRole $role, ?bool $ownCardsOnly): SpaceMember
    {
        return DB::transaction(function () use ($actor, $space, $user, $role, $ownCardsOnly) {
            if ($role !== null) {
                $this->changeRole->handle($actor, $space, $user, $role);
            }

            if ($ownCardsOnly !== null) {
                $this->setRestriction->handle($actor, $space, $user, $ownCardsOnly);
            }

            return $space->members()->where('user_id', $user->getKey())->firstOrFail();
        });
    }
}
