<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Права на пространство.
 *
 * Системный администратор управляет пространствами как объектами (создание, архив, назначение ролей),
 * но к содержимому доступа не имеет, пока не назначит роль себе. Содержимое — только участникам.
 */
class SpacePolicy
{
    use ChecksCompanyPermission, ChecksSpaceRole;

    // --- Админка компании: права компании (ADR-0024; правом роли — с П2d) ---

    public function adminViewAny(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageStructure);
    }

    public function create(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageStructure);
    }

    public function archive(User $actor, Space $space): Response
    {
        return $this->allowCompany($actor, $space->company, Permission::CompanyManageStructure);
    }

    public function restore(User $actor, Space $space): Response
    {
        return $this->allowCompany($actor, $space->company, Permission::CompanyManageStructure);
    }

    /** Удалить пустое пространство навсегда (LATER-43). */
    public function delete(User $actor, Space $space): Response
    {
        return $this->allowCompany($actor, $space->company, Permission::CompanyManageStructure);
    }

    /** Назначить роль в пространстве себе или другому пользователю (право компании «управлять доступом»). */
    public function assignRole(User $actor, Space $space): Response
    {
        return $this->allowCompany($actor, $space->company, Permission::CompanyManageAccess);
    }

    // --- Содержимое: участники пространства -------------------------------

    public function view(User $actor, Space $space): Response
    {
        return $this->allowMember($actor, $space);
    }

    /** Название, описание, иконка (ADR-0024: «редактирование» пространства). */
    public function update(User $actor, Space $space): Response
    {
        return $this->allowPermission($actor, $space, Permission::SpaceUpdate);
    }

    /** Добавлять и исключать людей и группы, менять их роли (ADR-0005, ADR-0012): «управление доступом». */
    public function manageMembers(User $actor, Space $space): Response
    {
        return $this->allowPermission($actor, $space, Permission::SpaceManageAccess);
    }

    /**
     * Видеть источники доступа (вкладка «Группы», группы у людей). Пользователю, у которого все источники
     * с режимом «только свои карточки» (подрядчик), названия групп и роли источников не показываются.
     */
    public function viewAccessSources(User $actor, Space $space): Response
    {
        $access = $space->accessOf($actor);

        if (! $access->isMember()) {
            return Response::denyAsNotFound();
        }

        return $access->isRestricted() ? Response::deny() : Response::allow();
    }

    /** Создать метку пространства — часть редактирования пространства (ADR-0024). */
    public function createLabel(User $actor, Space $space): Response
    {
        return $this->allowPermission($actor, $space, Permission::SpaceUpdate);
    }
}
