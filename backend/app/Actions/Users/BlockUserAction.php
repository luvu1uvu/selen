<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * «Отключить учётную запись» — блокировка Владельцем (решение PM 28.10, п. 2): вход и все сеансы закрываются во всех
 * компаниях сразу, членство не меняется («дома» остаются, их выдачи «спят»); включить может только Владелец. Если человек
 * — последний действующий администратор какой-нибудь своей компании, отказ (инвариант — во всех его компаниях, аудит
 * S-1). Событие — без компании, «о человеке»: его видят все компании, где он «дом».
 */
class BlockUserAction
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

            if ($user->isOwner()) {
                throw ValidationException::withMessages(['user' => __('selen.users.owner_not_deactivated')]);
            }
            if ($user->isBlocked()) {
                throw ValidationException::withMessages(['user' => __('selen.users.already_blocked')]);
            }

            foreach ($user->companies()->wherePivotNull('deactivated_at')->wherePivot('is_admin', true)->get() as $home) {
                $this->adminGuard->ensureAnotherActiveAdminExists($user, $home);
            }

            $now = Date::now();
            $user->forceFill([
                'status' => UserStatus::Deactivated,
                'blocked_at' => $now,
                'deactivated_at' => $user->deactivated_at ?? $now,
            ])->save();
            $this->sessions->terminate($user);
            // Ждущая смена email уходит вместе со входом: отключённого ведёт только Владелец (аудит П2c-2, S-2)
            EmailChangeRequest::query()->whereKey($user->id)->delete();

            $this->events->record(EventType::UserBlocked, $actor, $user);

            return $user;
        });
    }
}
