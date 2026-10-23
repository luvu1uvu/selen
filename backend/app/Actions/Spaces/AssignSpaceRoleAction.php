<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\Space;
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
        private readonly SpaceGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role): AccessGrant
    {
        // Вложенные Actions блокируют пространство и перепроверяют состав участников сами
        $isMember = $this->grants->personal($space, $user) !== null;

        return $isMember
            ? $this->change->handle($actor, $space, $user, $role, self::VIA)
            : $this->add->handle($actor, $space, $user, $role, self::VIA);
    }
}
