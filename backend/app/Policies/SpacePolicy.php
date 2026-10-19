<?php

namespace App\Policies;

use App\Models\Space;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Права на пространство.
 *
 * Системный администратор управляет пространствами как объектами (создание, архив, назначение ролей),
 * но к содержимому доступа не имеет, пока не назначит роль себе. Содержимое — только участникам.
 */
class SpacePolicy
{
    use ChecksSpaceRole;

    // --- Админка: системный администратор ---------------------------------

    public function adminViewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function archive(User $actor, Space $space): bool
    {
        return $actor->isAdmin();
    }

    public function restore(User $actor, Space $space): bool
    {
        return $actor->isAdmin();
    }

    /** Удалить пустое пространство навсегда (LATER-43). */
    public function delete(User $actor, Space $space): bool
    {
        return $actor->isAdmin();
    }

    /** Назначить роль в пространстве себе или другому пользователю. */
    public function assignRole(User $actor, Space $space): bool
    {
        return $actor->isAdmin();
    }

    // --- Содержимое: участники пространства -------------------------------

    public function view(User $actor, Space $space): Response
    {
        return $this->allowMember($actor, $space);
    }

    public function update(User $actor, Space $space): Response
    {
        return $this->allowSpaceAdmin($actor, $space);
    }

    /** Добавлять и исключать людей и группы, менять их роли (ADR-0005, ADR-0012). */
    public function manageMembers(User $actor, Space $space): Response
    {
        return $this->allowSpaceAdmin($actor, $space);
    }

    /**
     * Видеть источники доступа (вкладка «Группы», группы у людей). Пользователю, у которого все источники
     * с режимом «только свои карточки» (подрядчик), названия групп и роли источников не показываются.
     */
    public function viewAccessSources(User $actor, Space $space): Response
    {
        $access = $space->accessOf($actor);

        if (! $access->isMember()) {
            return Response::denyAsNotFound();
        }

        return $access->isRestricted() ? Response::deny() : Response::allow();
    }

    /** Создать метку пространства. */
    public function createLabel(User $actor, Space $space): Response
    {
        return $this->allowSpaceAdmin($actor, $space);
    }
}
