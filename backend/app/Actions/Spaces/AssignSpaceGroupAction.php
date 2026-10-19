<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Models\Group;
use App\Models\Space;
use App\Models\SpaceGroup;
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
    ) {}

    public function handle(User $actor, Space $space, Group $group, SpaceRole $role, bool $ownCardsOnly): SpaceGroup
    {
        // Вложенные Actions блокируют пространство и перепроверяют доступы сами
        $granted = $space->groupGrants()->where('group_id', $group->id)->exists();

        return $granted
            ? $this->update->handle($actor, $space, $group, $role, $ownCardsOnly, AssignSpaceRoleAction::VIA)
            : $this->grant->handle($actor, $space, $group, $role, $ownCardsOnly, AssignSpaceRoleAction::VIA);
    }
}
