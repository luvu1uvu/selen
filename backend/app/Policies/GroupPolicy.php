<?php

namespace App\Policies;

use App\Models\Group;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Auth\Access\Response;

/**
 * Группы ведёт только системный администратор (ADR-0012). Архивная группа — только для чтения.
 * Выдача доступа группе к пространству — SpacePolicy::manageMembers (администратор пространства).
 */
class GroupPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function view(User $actor, Group $group): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    /** Изменить название, описание, состав или доступы группы. */
    public function update(User $actor, Group $group): Response
    {
        if (! $actor->isAdmin()) {
            return Response::deny();
        }

        return $group->isArchived() ? Response::deny(__('selen.groups.archived')) : Response::allow();
    }

    public function archive(User $actor, Group $group): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Справочник активных групп для выдачи доступа: системный администратор и администраторы пространств
     * (как справочник сотрудников).
     */
    public function viewDirectory(User $actor): bool
    {
        return $actor->isAdmin() || app(AccessResolver::class)->managesAccessAnywhere($actor);
    }
}
