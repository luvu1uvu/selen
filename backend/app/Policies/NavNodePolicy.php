<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use Illuminate\Auth\Access\Response;

/**
 * Дерево навигации компании ведёт тот, у кого право компании «управлять структурой» — администратор компании
 * и Владелец (ADR-0013, ADR-0024; права на папки ролью — П2d-2), «Доступ…» узлов — право компании «управлять доступом»
 * (П2d-1). Своё дерево (GET /navigation) видит каждый — оно строится по его правам, политика для него не нужна.
 */
class NavNodePolicy
{
    use ChecksCompanyPermission;

    public function manage(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageStructure);
    }

    public function update(User $actor, NavNode $node): Response
    {
        return $this->allowCompany($actor, $node->company, Permission::CompanyManageStructure);
    }

    /**
     * «Доступ…» папки и пространства в админке (П2d-1): право компании «управлять доступом». Права «Администратора» на
     * папки ролью — П2d-2 (В11).
     */
    public function manageAccess(User $actor, NavNode $node): Response
    {
        return $this->allowCompany($actor, $node->company, Permission::CompanyManageAccess);
    }

    /** Удалить пустую папку навсегда (LATER-43). */
    public function delete(User $actor, NavNode $node): Response
    {
        return $this->allowCompany($actor, $node->company, Permission::CompanyManageStructure);
    }
}
