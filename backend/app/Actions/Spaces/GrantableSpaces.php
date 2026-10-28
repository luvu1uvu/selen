<?php

namespace App\Actions\Spaces;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

/**
 * Пространства компании, где человек может выдать доступ при приглашении и добавлении гостя (аудит Kaiten, П2c): все
 * действующие пространства — у кого право компании «управлять доступом» (администратор компании, Владелец), иначе — те,
 * где у него «управление доступом» (лично или через группу). Права — только из Company::permissionsOf и Space::accessOf.
 */
class GrantableSpaces
{
    /** @return Collection<int, Space> */
    public function of(User $actor, Company $company): Collection
    {
        $spaces = Space::query()->inCompany($company)->whereNull('archived_at')->orderByRaw('lower(name)')->get();
        if ($company->permissionsOf($actor)->allows(Permission::CompanyManageAccess)) {
            return $spaces;
        }

        $accesses = Space::accessesOf($actor);

        return $spaces->filter(fn (Space $space) => ($accesses[$space->id] ?? null)?->allows(Permission::SpaceManageAccess) ?? false)->values();
    }

    public function allows(User $actor, Space $space, Company $company): bool
    {
        return $space->company_id === $company->id && ! $space->isArchived()
            && ($company->permissionsOf($actor)->allows(Permission::CompanyManageAccess)
                || $space->accessOf($actor)->allows(Permission::SpaceManageAccess));
    }
}
