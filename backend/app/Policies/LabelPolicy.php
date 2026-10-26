<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Метки. Общие метки компании ведёт тот, у кого право компании «управлять справочниками» (администратор компании
 * и Владелец, ADR-0024), метки пространства — администратор пространства (не участник — 404, ADR-0005). Смотрят
 * и ставят на карточки — участники пространства. Метка другой компании — 404.
 */
class LabelPolicy
{
    use ChecksCompanyPermission, ChecksSpaceRole;

    /** Список и создание общих меток компании (админка). */
    public function manageCompanyLabels(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageDictionaries);
    }

    /** Изменить, архивировать или восстановить метку. */
    public function manage(User $actor, Label $label): Response
    {
        if ($label->isCompanyWide()) {
            return $this->allowCompany($actor, $label->company, Permission::CompanyManageDictionaries);
        }

        /** @var Space $space */
        $space = $label->space;

        return $this->allowPermission($actor, $space, Permission::SpaceUpdate);
    }
}
