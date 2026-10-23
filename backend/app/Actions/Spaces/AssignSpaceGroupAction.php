<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;

/**
 * Доступ группы к пространству из админки (страница группы): выдать, если его нет, иначе изменить.
 * В журнале — via=admin_panel.
 */
class AssignSpaceGroupAction
{
    public function __construct(
        private readonly GrantSpaceGroupAction $grant,
        private readonly UpdateSpaceGroupAction $update,
        private readonly SpaceGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, Group $group, SpaceRole $role, bool $ownCardsOnly): AccessGrant
    {
        // Вложенные Actions блокируют пространство и перепроверяют доступы сами
        $granted = $this->grants->ofGroup($space, $group) !== null;

        return $granted
            ? $this->update->handle($actor, $space, $group, $role, $ownCardsOnly, AssignSpaceRoleAction::VIA)
            : $this->grant->handle($actor, $space, $group, $role, $ownCardsOnly, AssignSpaceRoleAction::VIA);
    }
}
