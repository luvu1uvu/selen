<?php

namespace App\Policies\Concerns;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\User;
use Closure;
use Illuminate\Auth\Access\Response;

/**
 * Права компании в политиках админки (docs/adr/0024-rights-2.md): только из Company::permissionsOf().
 * - не участник компании (не её «дом» и не Владелец) — 404: чужой компании для него нет, как несуществующей;
 * - участник без права компании — 403.
 * Доступа к содержимому пространств права компании не дают (ADR-0005) — его проверяет ChecksSpaceRole.
 */
trait ChecksCompanyPermission
{
    protected function allowCompany(User $actor, Company $company, Permission $permission): Response
    {
        $access = $company->permissionsOf($actor);

        if (! $access->isMember()) {
            return Response::denyAsNotFound();
        }

        return $access->allows($permission) ? Response::allow() : Response::deny();
    }

    /**
     * Не участник компании — 404; участник — по условию (403, если оно не выполнено).
     *
     * @param  Closure(): bool  $condition
     */
    protected function allowCompanyMemberIf(User $actor, Company $company, Closure $condition): Response
    {
        if (! $company->permissionsOf($actor)->isMember()) {
            return Response::denyAsNotFound();
        }

        return $condition() ? Response::allow() : Response::deny();
    }
}
