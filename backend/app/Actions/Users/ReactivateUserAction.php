<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Возврат в компанию (П2c): «дом» снова действует — вместе с его «спящими» выдачами, группами и правами компании; вход
 * открывается, если учётную запись не отключил Владелец (её включает только он — UnblockUserAction). Тому, кто не принял
 * приглашение (приглашение отозвано), нужно отправить приглашение повторно.
 */
class ReactivateUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly AccountStatus $accountStatus,
    ) {}

    public function handle(User $actor, User $user, Company $company): User
    {
        return DB::transaction(function () use ($actor, $user, $company) {
            $user = $this->lock->lock($actor, $user, $company);

            $membership = $this->resolver->membership($company, $user, lock: true);
            if ($membership === null || $membership->kind !== AccessResolver::HOME || $membership->deactivated_at === null) {
                throw ValidationException::withMessages(['user' => __('selen.users.not_deactivated')]);
            }

            if (! $user->hasActivated()) {
                throw ValidationException::withMessages(['user' => __('selen.users.never_activated')]);
            }

            if ($user->isBlocked()) {
                throw ValidationException::withMessages(['user' => __('selen.users.blocked')]);
            }

            $this->memberships->reactivateHome($company, $user);
            $this->accountStatus->sync($user);
            $company->forgetResolvedPermissions();

            $this->events->record(EventType::UserReactivated, $actor, $user, company: $company);

            return $user;
        });
    }
}
