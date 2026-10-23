<?php

namespace App\Policies;

use App\Enums\CompanyRole;
use App\Enums\Permission;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use Illuminate\Auth\Access\Response;

/**
 * Приглашения в компанию — право компании «приглашать пользователей» (администратор компании и Владелец, ADR-0024).
 * Приглашённым администратором компании управляет только Владелец, как и самими администраторами
 * (UserPolicy::manages, ADR-0017). Приглашение другой компании — 404 (привязка маршрута).
 */
class InvitationPolicy
{
    use ChecksCompanyPermission;

    public function viewAny(User $actor, Company $company): Response
    {
        return $this->allowCompany($actor, $company, Permission::CompanyInviteUsers);
    }

    /**
     * @param  CompanyRole|null  $role  роль приглашаемого (null — не указана или неверна: ответит валидация, 422)
     */
    public function create(User $actor, Company $company, ?CompanyRole $role = null): Response
    {
        $response = $this->allowCompany($actor, $company, Permission::CompanyInviteUsers);

        return $response->allowed() && $role === CompanyRole::Admin && ! $actor->isOwner() ? Response::deny() : $response;
    }

    public function resend(User $actor, Invitation $invitation, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => app(UserPolicy::class)->manages($actor, $invitation->user, $company));
    }

    public function revoke(User $actor, Invitation $invitation, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => app(UserPolicy::class)->manages($actor, $invitation->user, $company));
    }
}
