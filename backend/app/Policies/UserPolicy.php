<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\User;
use App\Services\Access\SpaceAccessResolver;

/**
 * Права на управление пользователями. Бизнес-ограничения (последний администратор и т. п.)
 * проверяют Actions; здесь — только «кто может выполнять действие».
 *
 * Кем управляет системный администратор (ADR-0017): Владельцем — никто (и он сам, кроме передачи владения);
 * администраторами — только Владелец; участниками — любой системный администратор (и Владелец).
 */
class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Справочник сотрудников для выбора участников пространства: системный администратор
     * и администраторы пространств (лично или через группу).
     */
    public function viewDirectory(User $actor): bool
    {
        return $actor->isAdmin() || app(SpaceAccessResolver::class)->administersAnySpace($actor);
    }

    /** Назначает и снимает администратора только Владелец (себе — нет: его роль меняет только передача). */
    public function updateRole(User $actor, User $user): bool
    {
        return $actor->isOwner() && $actor->isNot($user);
    }

    public function deactivate(User $actor, User $user): bool
    {
        return $actor->isNot($user) && $this->manages($actor, $user);
    }

    public function reactivate(User $actor, User $user): bool
    {
        return $actor->isNot($user) && $this->manages($actor, $user);
    }

    /** Передаёт владение только Владелец и только другому (активность получателя проверяет Action — 422). */
    public function transferOwnership(User $actor, User $user): bool
    {
        return $actor->isOwner() && $actor->isNot($user);
    }

    /**
     * Может ли системный администратор менять учётную запись пользователя (статус, приглашение).
     * Используется и InvitationPolicy.
     */
    public function manages(User $actor, User $user): bool
    {
        if (! $actor->isAdmin()) {
            return false;
        }

        return match ($user->role) {
            UserRole::Owner => false,
            UserRole::Admin => $actor->isOwner(),
            UserRole::Member => true,
        };
    }
}
