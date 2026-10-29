<?php

namespace App\Actions\Spaces;

use App\Actions\Access\SetNodeAccessAction;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Добавить участника в пространство с одной стандартной ролью — для мест без выбора ролей: создатель пространства
 * (space_created), QA-бот стенда, демо-данные. Выдачи меняет SetNodeAccessAction (П2d-1: несколько ролей, папки).
 * $via фиксирует в журнале, откуда пришло назначение.
 */
class AddSpaceMemberAction
{
    public function __construct(private readonly SetNodeAccessAction $setAccess) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole|StandardRole $role, ?string $via = null, bool $ownCardsOnly = false): void
    {
        if ($role instanceof SpaceRole) {
            if ($ownCardsOnly && $role->canManageSpace()) {
                throw ValidationException::withMessages(['roles' => __('selen.spaces.admin_not_restricted')]);
            }
            $role = StandardRole::fromLegacy($role, $ownCardsOnly);
        }

        $this->setAccess->handle($actor, $space->navNode, $user, [Role::standard($role)], $via, SetNodeAccessAction::CREATE);
    }
}
