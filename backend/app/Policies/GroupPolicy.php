<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\Group;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use App\Services\Access\AccessResolver;
use Illuminate\Auth\Access\Response;

/**
 * Группы компании ведёт тот, у кого право компании «управлять группами» — администратор компании и Владелец
 * (ADR-0012, ADR-0024). Архивная группа — только для чтения. Группа другой компании — 404.
 * Выдача доступа группе к пространству — SpacePolicy::manageMembers (администратор пространства).
 */
class GroupPolicy
{
    use ChecksCompanyPermission;

    public function viewAny(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageGroups);
    }

    public function view(User $actor, Group $group): Response
    {
        return $this->allowCompany($actor, $group->company, Permission::CompanyManageGroups);
    }

    public function create(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageGroups);
    }

    /** Изменить название, описание, состав или доступы группы. */
    public function update(User $actor, Group $group): Response
    {
        $response = $this->allowCompany($actor, $group->company, Permission::CompanyManageGroups);

        return $response->allowed() && $group->isArchived() ? Response::deny(__('selen.groups.archived')) : $response;
    }

    /**
     * Доступ группы к пространствам (выдать, сменить роль, снять) — это выдача доступа: нужно ещё право компании
     * «управлять доступом» (как роль в пространстве из админки). С одним «управлять группами» участник иначе выдал бы
     * себе через группу роль в любом пространстве (ревью П2c-1).
     */
    public function manageSpaces(User $actor, Group $group): Response
    {
        $response = $this->update($actor, $group);

        return $response->allowed() && ! $group->company->permissionsOf($actor)->allows(Permission::CompanyManageAccess)
            ? Response::deny()
            : $response;
    }

    /**
     * Состав группы: если группа даёт доступ к пространствам — ещё «управлять доступом», если права компании — только
     * Владелец и администратор компании (права компании выдают только они, решение PM 23.10, В17).
     */
    public function manageMembers(User $actor, Group $group): Response
    {
        $response = $this->update($actor, $group);
        if (! $response->allowed()) {
            return $response;
        }

        $grants = app(AccessResolver::class)->groupGrants($group);
        $access = $group->company->permissionsOf($actor);
        $allowed = (! $grants['access'] || $access->allows(Permission::CompanyManageAccess))
            && (! $grants['company_permissions'] || $access->isAdmin());

        return $allowed ? $response : Response::deny();
    }

    public function archive(User $actor, Group $group): Response
    {
        return $this->allowCompany($actor, $group->company, Permission::CompanyManageGroups);
    }

    /**
     * Права компании группы (П2c): смотреть и менять — Владелец и администратор компании (участник с правами их не
     * выдаёт, решение PM 23.10, В17), в том числе у «Все сотрудники» — так задаются права для всех новых сотрудников
     * (решение PM 28.10, п. 7). Группа в архиве — только смотреть.
     */
    public function viewPermissions(User $actor, Group $group): Response
    {
        return $this->allowCompanyMemberIf($actor, $group->company, fn () => $group->company->permissionsOf($actor)->isAdmin());
    }

    public function managePermissions(User $actor, Group $group): Response
    {
        $response = $this->viewPermissions($actor, $group);

        return $response->allowed() && $group->isArchived() ? Response::deny(__('selen.groups.archived')) : $response;
    }

    /**
     * Справочник активных групп компании для выдачи доступа — как справочник людей (UserPolicy::viewDirectory).
     */
    public function viewDirectory(User $actor, Company $company): Response
    {
        return app(UserPolicy::class)->viewDirectory($actor, $company);
    }
}
