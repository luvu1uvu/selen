<?php

namespace App\Actions\Auth;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

/**
 * Установка нового пароля по токену из письма. Все сессии пользователя завершаются.
 * Пользователь после сброса входит заново.
 */
class ResetPasswordAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
    ) {}

    public function handle(string $email, #[\SensitiveParameter] string $token, #[\SensitiveParameter] string $password): void
    {
        $status = Password::broker()->reset(
            [
                'email' => mb_strtolower(trim($email)),
                'status' => UserStatus::Active->value,
                'token' => $token,
                'password' => $password,
            ],
            function (User $user, string $password) {
                DB::transaction(function () use ($user, $password) {
                    $user->forceFill(['password' => $password])->save();
                    $this->sessions->terminate($user);

                    $this->events->record(EventType::PasswordResetCompleted, $user, $user);
                });
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            // «Пользователь не найден» не раскрываем: для клиента это просто неверная ссылка
            $message = $status === Password::INVALID_USER ? __(Password::INVALID_TOKEN) : __($status);

            throw ValidationException::withMessages(['email' => $message]);
        }
    }
}
