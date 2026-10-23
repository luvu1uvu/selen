<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use App\Services\Access\AccessResolver;
use Illuminate\Auth\Access\Response;

/**
 * Права на управление людьми компании (ADR-0017, ADR-0024). Бизнес-ограничения (последний администратор и т. п.)
 * проверяют Actions; здесь — только «кто может выполнять действие». Не участник компании — 404.
 *
 * Кем управляет администратор компании: Владельцем — никто (и он сам, кроме передачи владения); администраторами
 * компании — только Владелец; участниками — тот, у кого право компании «управлять пользователями» (администратор
 * компании и Владелец). Деактивация в П2b-1 — у учётной записи (решение PM 23.10); в компании — П2c.
 */
class UserPolicy
{
    use ChecksCompanyPermission;

    public function viewAny(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageUsers);
    }

    /**
     * Справочник людей компании для выбора участников пространства и групп: администратор компании (право
     * «управлять доступом») и администраторы пространств этой компании (лично или через группу).
     */
    public function viewDirectory(User $actor, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $company->permissionsOf($actor)->allows(Permission::CompanyManageAccess)
            || app(AccessResolver::class)->managesAccessIn($actor, $company));
    }

    /** Назначает и снимает администратора компании только Владелец (себе — нет: его роль меняет только передача). */
    public function updateRole(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isOwner() && $actor->isNot($user));
    }

    public function deactivate(User $actor, User $user, Company $company): Response
    {
        return $this->managesOther($actor, $user, $company);
    }

    public function reactivate(User $actor, User $user, Company $company): Response
    {
        return $this->managesOther($actor, $user, $company);
    }

    /** Передаёт владение только Владелец и только другому (активность получателя проверяет Action — 422). */
    public function transferOwnership(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isOwner() && $actor->isNot($user));
    }

    /** Может ли участник компании менять учётную запись её человека (роль в компании, статус). */
    public function manages(User $actor, User $user, Company $company): bool
    {
        if (! $company->permissionsOf($actor)->allows(Permission::CompanyManageUsers) || $user->isOwner()) {
            return false;
        }

        // Администратором компании управляет только Владелец
        return ! $company->permissionsOf($user)->isAdmin() || $actor->isOwner();
    }

    private function managesOther(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isNot($user) && $this->manages($actor, $user, $company));
    }
}
