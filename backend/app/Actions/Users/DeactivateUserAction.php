<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Деактивация в компании (docs/adr/0024-rights-2.md, П2c): человек убран из этой компании — её «дом» с отметкой, его
 * выдачи, группы и права компании в ней перестают действовать сразу, в других компаниях он работает как раньше. Вход
 * и все сеансы закрываются, когда у него не осталось ни одного действующего «дома» (AccountStatus). Пользователь
 * не удаляется. По желанию — передача доступа преемнику (AccessTransfer). Событие — в журнал этой компании.
 */
class DeactivateUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AdminGuard $adminGuard,
        private readonly UserLock $lock,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly AccountStatus $accountStatus,
        private readonly AccessTransfer $transfer,
    ) {}

    public function handle(User $actor, User $user, Company $company, ?User $successor = null): User
    {
        return DB::transaction(function () use ($actor, $user, $company, $successor) {
            $user = $this->lock->lock($actor, $user, $company);

            if ($user->isOwner()) {
                throw ValidationException::withMessages(['user' => __('selen.users.owner_not_deactivated')]);
            }

            $membership = $this->resolver->membership($company, $user, lock: true);
            if ($membership?->kind === AccessResolver::GUEST) {
                throw ValidationException::withMessages(['user' => __('selen.users.guest_not_deactivated')]);
            }
            // Приглашённого не деактивируют — отзывают приглашение
            if ($membership === null || $membership->deactivated_at !== null || $user->status === UserStatus::Invited) {
                throw ValidationException::withMessages(['user' => __('selen.users.not_active')]);
            }

            // Только администратор компании: Владельца деактивировать нельзя (выше), участник инвариант не затрагивает
            if ($company->permissionsOf($user)->isAdmin()) {
                $this->adminGuard->ensureAnotherActiveAdminExists($user, $company);
            }

            if ($successor !== null) {
                if ($successor->is($user) || ! $this->resolver->isHome($successor, $company) || ! $successor->isActive()) {
                    throw ValidationException::withMessages(['successor_id' => __('selen.users.successor_invalid')]);
                }
                $this->transfer->handle($actor, $user, $successor, $company);
            }

            $this->memberships->deactivateHome($company, $user);
            $this->accountStatus->sync($user);
            $company->forgetResolvedPermissions();

            $this->events->record(EventType::UserDeactivated, $actor, $user, company: $company);

            return $user;
        });
    }
}
