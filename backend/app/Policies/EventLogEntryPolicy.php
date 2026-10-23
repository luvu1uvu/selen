<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use Illuminate\Auth\Access\Response;

/** Журнал событий компании — право компании «журнал событий» (администратор компании и Владелец, ADR-0024). */
class EventLogEntryPolicy
{
    use ChecksCompanyPermission;

    public function viewAny(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyViewEventLog);
    }
}
