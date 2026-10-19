<?php

namespace App\Actions\Auth;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Password;

/**
 * Отправка ссылки для сброса пароля.
 *
 * Ничего не сообщает вызывающему о результате: ответ API одинаковый независимо от того,
 * существует ли пользователь (защита от перебора email). Письмо получают только активные.
 */
class SendPasswordResetLinkAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(string $email): void
    {
        $email = mb_strtolower(trim($email));

        $status = Password::broker()->sendResetLink(
            ['email' => $email, 'status' => UserStatus::Active->value],
        );

        if ($status === Password::RESET_LINK_SENT) {
            $user = User::query()->where('email', $email)->firstOrFail();
            $this->events->record(EventType::PasswordResetRequested, null, $user);
        }
    }
}
