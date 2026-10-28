<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\Group;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
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
