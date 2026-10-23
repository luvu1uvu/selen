<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Деактивация: пользователь не может войти, все его сессии и cookie «Запомнить меня»
 * становятся недействительными. Пользователь не удаляется. В П2b-1 деактивируется учётная запись (как раньше,
 * решение PM 23.10); деактивация в компании — П2c. Событие — в журнал компании, из админки которой деактивировали.
 */
class DeactivateUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
        private readonly AdminGuard $adminGuard,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user, Company $company): User
    {
        return DB::transaction(function () use ($actor, $user, $company) {
            $user = $this->lock->lock($actor, $user, $company);

            if ($user->status !== UserStatus::Active) {
                throw ValidationException::withMessages(['user' => __('selen.users.not_active')]);
            }

            if ($user->isOwner()) {
                throw ValidationException::withMessages(['user' => __('selen.users.owner_not_deactivated')]);
            }

            // Только администратор компании: Владельца деактивировать нельзя (выше), участник инвариант не затрагивает
            if ($company->permissionsOf($user)->isAdmin()) {
                $this->adminGuard->ensureAnotherActiveAdminExists($user, $company);
            }

            $user->forceFill(['status' => UserStatus::Deactivated, 'deactivated_at' => Date::now()])->save();
            $this->sessions->terminate($user);

            $this->events->record(EventType::UserDeactivated, $actor, $user, company: $company);

            return $user;
        });
    }
}
