<?php

namespace App\Policies;

use App\Models\Company;
use App\Models\User;
use App\Policies\Concerns\ChecksCompanyPermission;
use Illuminate\Auth\Access\Response;

/**
 * Компании ведёт только Владелец (ADR-0024, LATER-11): список, создание из шаблона, переименование; администраторов
 * компании он назначает и снимает в её «Пользователях» (UserPolicy::updateRole). Компании не удаляются и не
 * архивируются. Переименовать компанию: не участник — 404 (компании для него нет), участник — 403.
 */
class CompanyPolicy
{
    use ChecksCompanyPermission;

    public function viewAny(User $actor): Response
    {
        return $actor->isOwner() ? Response::allow() : Response::deny();
    }

    public function create(User $actor): Response
    {
        return $actor->isOwner() ? Response::allow() : Response::deny();
    }

    public function update(User $actor, Company $company): Response
    {
        return $this->allowCompanyMemberIf($actor, $company, fn () => $actor->isOwner());
    }
}
