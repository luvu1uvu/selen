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
 * компании (и убранными из неё) — только Владелец; участниками и гостями — тот, у кого право компании «управлять
 * пользователями». Деактивация и возврат — в компании (П2c): человек с «домами» в нескольких компаниях убирается только
 * из этой, поэтому ограничение «только Владелец» снято. Учётную запись целиком отключает и включает только Владелец.
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

    /**
     * Передать доступ уходящего преемнику — это выдача доступа к пространствам, групп и прав компании: только Владелец
     * и администратор компании (права компании выдают только они, В17; ревью П2c-1).
     */
    public function transferAccess(User $actor, User $user, Company $company): Response
    {
        $response = $this->deactivate($actor, $user, $company);

        return $response->allowed() && ! $company->permissionsOf($actor)->isAdmin() ? Response::deny() : $response;
    }

    public function reactivate(User $actor, User $user, Company $company): Response
    {
        return $this->managesOther($actor, $user, $company);
    }

    /**
     * «Завершить все сеансы» (П2c-2) — как деактивация: право «управлять пользователями», Владельцем не управляет никто,
     * администраторами компании — только Владелец. Цель — действующий сотрудник этой компании: сеансы у учётной записи
     * общие, а гость и убранный из компании работают в другой (решение PM 28.10, п. 8 — администратор любой его компании).
     */
    public function terminateSessions(User $actor, User $user, Company $company): Response
    {
        $response = $this->managesOther($actor, $user, $company);

        return $response->allowed() && ! $company->permissionsOf($user)->isMember() ? Response::deny() : $response;
    }

    /**
     * Смена email (П2c-2, LATER-9) — как «Завершить все сеансы»; у сотрудника нескольких компаний учётная запись общая —
     * его email меняет только Владелец (решение PM 28.10, п. 8). Ещё не принявший приглашение — 422 в Action.
     */
    public function changeEmail(User $actor, User $user, Company $company): Response
    {
        $response = $this->terminateSessions($actor, $user, $company);

        return $response->allowed() && $company->permissionsOf($user)->hasOtherHomes() && ! $actor->isOwner()
            ? Response::deny()
            : $response;
    }

    /** Передаёт владение только Владелец и только другому (активность получателя проверяет Action — 422). */
    public function transferOwnership(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isOwner() && $actor->isNot($user));
    }

    /** «Отключить» и «Включить» учётную запись — только Владелец (решение PM 28.10, п. 2); себя — нет. */
    public function block(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isOwner() && $actor->isNot($user));
    }

    /**
     * Права компании человека («Права компании»): смотреть и менять — Владелец и администратор компании (участник
     * с правами их не выдаёт, решение PM 23.10, В17). Цель — действующий «дом», не Владелец (у него все права);
     * администратора компании (и себя) — только Владелец.
     * Какие именно права может менять автор — CompanyPermissions::editableBy().
     */
    public function managePermissions(User $actor, User $user, Company $company): Response
    {
        // Права администратора компании (и свои) меняет только Владелец: администраторами управляет он (правило 16)
        return $this->allowCompanyMemberIf($actor, $company, fn () => $company->permissionsOf($actor)->isAdmin()
            && ! $user->isOwner()
            && $company->permissionsOf($user)->isMember()
            && ($actor->isOwner() || ! $company->permissionsOf($user)->isAssignedAdmin()));
    }

    /**
     * Гости компании («Добавить гостя», срок, «Убрать гостя») — право «управлять пользователями» (план, раздел 3).
     * Цель (для изменения и удаления) — гость этой компании; проверяет Action.
     */
    public function manageGuests(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyManageUsers);
    }

    /**
     * Пространства, где можно выдать доступ приглашённому и гостю: тому, кто приглашает или ведёт гостей (сами
     * пространства — по праву выдавать доступ в них, GrantableSpaces).
     */
    public function viewGrantableSpaces(User $actor, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $company->permissionsOf($actor)->allows(Permission::CompanyInviteUsers)
            || $company->permissionsOf($actor)->allows(Permission::CompanyManageUsers));
    }

    /** Может ли участник компании менять учётную запись её человека (роль в компании, статус). */
    public function manages(User $actor, User $user, Company $company): bool
    {
        if (! $company->permissionsOf($actor)->allows(Permission::CompanyManageUsers) || $user->isOwner()) {
            return false;
        }

        // Администратором компании (и убранным из неё) управляет только Владелец
        return $actor->isOwner() || ! $company->permissionsOf($user)->isAssignedAdmin();
    }

    private function managesOther(User $actor, User $user, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isNot($user) && $this->manages($actor, $user, $company));
    }
}
