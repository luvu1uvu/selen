<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * «Завершить все сеансы» человека (П2c-2, аудит Kaiten «сбросить сессии»): все его сеансы и cookie «Запомнить меня»
 * перестают действовать — на каждом устройстве он войдёт заново со своим паролем. Учётная запись и доступ не меняются.
 * Событие — компании, где это сделал администратор.
 */
class TerminateUserSessionsAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user, Company $company): void
    {
        DB::transaction(function () use ($actor, $user, $company) {
            $user = $this->lock->lock($actor, $user, $company);

            $this->sessions->terminate($user);

            $this->events->record(EventType::UserSessionsTerminated, $actor, $user, company: $company);
        });
    }
}
