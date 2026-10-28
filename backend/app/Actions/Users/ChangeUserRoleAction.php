<?php

namespace App\Actions\Users;

use App\Enums\CompanyRole;
use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Смена роли в компании: участник ↔ администратор компании (company_members.is_admin, ADR-0024). Роль Владельца
 * так не назначается и не снимается — только передачей владения (TransferOwnershipAction, ADR-0017).
 * Кто может — UserPolicy::updateRole (только Владелец).
 */
class ChangeUserRoleAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AdminGuard $adminGuard,
        private readonly UserLock $lock,
        private readonly AccessResolver $resolver,
    ) {}

    public function handle(User $actor, User $user, Company $company, CompanyRole $role): User
    {
        return DB::transaction(function () use ($actor, $user, $company, $role) {
            $user = $this->lock->lock($actor, $user, $company);

            if ($user->isOwner()) {
                throw ValidationException::withMessages(['role' => __('selen.users.owner_role_by_transfer')]);
            }

            // Гость администратором компании не бывает (П2c); роль убранного из компании — какой она записана
            if ($this->resolver->membership($company, $user)?->kind !== AccessResolver::HOME) {
                throw ValidationException::withMessages(['role' => __('selen.users.guest_no_role')]);
            }
            $from = CompanyRole::of($company->permissionsOf($user)->isAssignedAdmin());
            if ($from === $role) {
                return $user;
            }

            // Снятие администратора компании (Владелец сюда не доходит — выше)
            if ($from === CompanyRole::Admin) {
                $this->adminGuard->ensureAnotherActiveAdminExists($user, $company);
            }

            $company->users()->updateExistingPivot($user->id, ['is_admin' => $role === CompanyRole::Admin]);
            $company->forgetResolvedPermissions();

            $this->events->record(EventType::UserRoleChanged, $actor, $user, [
                'from' => $from->value,
                'to' => $role->value,
            ], company: $company);

            return $user;
        });
    }
}
