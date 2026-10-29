<?php

namespace App\Actions\Spaces;

use App\Actions\Access\SetNodeAccessAction;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\Group;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Выдать группе доступ к пространству с одной ролью API (роль + «только свои карточки») — для демо-данных и мест без
 * выбора ролей. Выдачи меняет SetNodeAccessAction (П2d-1: несколько ролей, папки).
 */
class GrantSpaceGroupAction
{
    public function __construct(private readonly SetNodeAccessAction $setAccess) {}

    public function handle(User $actor, Space $space, Group $group, SpaceRole $role, bool $ownCardsOnly = false, ?string $via = null): void
    {
        if ($ownCardsOnly && $role->canManageSpace()) {
            throw ValidationException::withMessages(['roles' => __('selen.spaces.admin_not_restricted')]);
        }

        $roles = [Role::standard(StandardRole::fromLegacy($role, $ownCardsOnly))];
        $this->setAccess->handle($actor, $space->navNode, $group, $roles, $via, SetNodeAccessAction::CREATE);
    }
}
