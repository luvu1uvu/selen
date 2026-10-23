<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Метки. Общие метки компании ведёт системный администратор, метки пространства — администратор
 * пространства (не участник — 404, ADR-0005). Смотрят и ставят на карточки — участники пространства.
 */
class LabelPolicy
{
    use ChecksSpaceRole;

    /** Список и создание общих меток компании (админка). */
    public function manageCompanyLabels(User $actor): bool
    {
        return $actor->isAdmin();
    }

    /** Изменить, архивировать или восстановить метку. */
    public function manage(User $actor, Label $label): Response
    {
        if ($label->isCompanyWide()) {
            return $actor->isAdmin() ? Response::allow() : Response::deny();
        }

        /** @var Space $space */
        $space = $label->space;

        return $this->allowPermission($actor, $space, Permission::SpaceUpdate);
    }
}
