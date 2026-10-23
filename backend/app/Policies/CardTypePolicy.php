<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use Illuminate\Auth\Access\Response;

/**
 * Типы карточек — справочник компании (ADR-0024): читают участники пространств компании (GET spaces/{key}/card-types),
 * меняет тот, у кого право компании «управлять справочниками» (администратор компании и Владелец).
 */
class CardTypePolicy
{
    use ChecksCompanyPermission;

    public function manage(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageDictionaries);
    }
}
