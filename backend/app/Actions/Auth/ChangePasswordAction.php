<?php

namespace App\Actions\Auth;

use App\Enums\EventType;
use App\Models\User;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Смена пароля из профиля. Текущий пароль проверяет Form Request (правило current_password).
 * Сессии на других устройствах завершаются, текущая остаётся.
 */
class ChangePasswordAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
    ) {}

    public function handle(User $user, #[\SensitiveParameter] string $newPassword, ?string $currentSessionId): void
    {
        DB::transaction(function () use ($user, $newPassword, $currentSessionId) {
            $user->forceFill(['password' => $newPassword])->save();
            $this->sessions->terminate($user, exceptSessionId: $currentSessionId);

            $this->events->record(EventType::PasswordChanged, $user, $user);
        });
    }
}
