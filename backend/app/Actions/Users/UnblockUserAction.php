<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * «Включить учётную запись» (только Владелец, решение PM 28.10, п. 2): блокировка снимается; войти человек сможет, если
 * у него есть действующий «дом» (AccountStatus). Событие — без компании, «о человеке».
 */
class UnblockUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
        private readonly AccountStatus $accountStatus,
    ) {}

    public function handle(User $actor, User $user, Company $company): User
    {
        return DB::transaction(function () use ($actor, $user, $company) {
            $user = $this->lock->lock($actor, $user, $company);

            if (! $user->isBlocked()) {
                throw ValidationException::withMessages(['user' => __('selen.users.not_blocked')]);
            }

            $user->forceFill(['blocked_at' => null])->save();
            $this->accountStatus->sync($user);

            $this->events->record(EventType::UserUnblocked, $actor, $user);

            return $user;
        });
    }
}
