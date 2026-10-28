<?php

namespace App\Actions\Spaces;

use App\Enums\Permission;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Инвариант «в пространстве есть администратор» (ADR-0005, ADR-0012): хотя бы одна ЛИЧНАЯ выдача (не через группу)
 * с правом «управление доступом» не деактивированному пользователю — в П2a это роль «Администратор» (ADR-0024).
 * Администраторы через группы — дополнительные. Строго действует на операции с участниками и группами; деактивацию
 * не блокирует (решение PM этапа 3), но её последствия показывает lastAdminSpaces(). Считает AccessResolver.
 */
class SpaceAdminGuard
{
    public function __construct(private readonly AccessResolver $resolver) {}

    /** Заблокировать пространство до конца транзакции: изменения состава участников идут по очереди. */
    public function lock(Space $space): Space
    {
        return Space::query()->lockForUpdate()->findOrFail($space->getKey());
    }

    /** Даёт ли выдача право «управление доступом» — тогда её снятие или смена проверяют инвариант. */
    public function managesAccess(AccessGrant $grant): bool
    {
        return $this->resolver->rolePermits($grant->role_id, Permission::SpaceManageAccess);
    }

    /** Вызывать внутри транзакции после lock(). */
    public function ensureAnotherAdminRemains(Space $space, User $user): void
    {
        if (! $this->resolver->hasAnotherActivePersonalManager($space, $user)) {
            throw ValidationException::withMessages(['role' => __('selen.spaces.last_admin')]);
        }
    }

    /**
     * Пространства, где пользователь — последний личный не деактивированный администратор
     * (после его деактивации там не останется действующего администратора).
     *
     * @return Collection<int, Space>
     */
    public function lastAdminSpaces(User $user, ?Company $company): Collection
    {
        return $this->resolver->lastManagerSpaces($user, $company);
    }
}
