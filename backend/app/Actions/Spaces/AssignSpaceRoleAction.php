<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;

/**
 * Назначение роли в пространстве из админки системным администратором — себе или другому.
 * Если пользователь ещё не участник — добавляется, иначе меняется роль. В журнале — via=admin_panel.
 */
class AssignSpaceRoleAction
{
    public const VIA = 'admin_panel';

    public function __construct(
        private readonly AddSpaceMemberAction $add,
        private readonly ChangeSpaceMemberRoleAction $change,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role): SpaceMember
    {
        // Вложенные Actions блокируют пространство и перепроверяют состав участников сами
        $isMember = $space->members()->where('user_id', $user->getKey())->exists();

        return $isMember
            ? $this->change->handle($actor, $space, $user, $role, self::VIA)
            : $this->add->handle($actor, $space, $user, $role, self::VIA);
    }
}
