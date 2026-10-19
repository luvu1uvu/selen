<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\Invitation;
use App\Models\User;

/**
 * Приглашения ведёт системный администратор; приглашённым с ролью администратора управляет только
 * Владелец, как и самими администраторами (UserPolicy::manages, ADR-0017).
 */
class InvitationPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    /**
     * @param  UserRole|null  $role  роль приглашаемого (null — не указана или неверна: ответит валидация, 422)
     */
    public function create(User $actor, ?UserRole $role = null): bool
    {
        return $actor->isAdmin() && ($role !== UserRole::Admin || $actor->isOwner());
    }

    public function resend(User $actor, Invitation $invitation): bool
    {
        return app(UserPolicy::class)->manages($actor, $invitation->user);
    }

    public function revoke(User $actor, Invitation $invitation): bool
    {
        return app(UserPolicy::class)->manages($actor, $invitation->user);
    }
}
