<?php

namespace App\Actions\Auth;

use App\Enums\EventType;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Вход по email и паролю. Неактивные пользователи (приглашённые, деактивированные) войти не могут.
 * Регенерацию сессии выполняет контроллер (это HTTP-уровень).
 */
class LoginAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(string $email, #[\SensitiveParameter] string $password, bool $remember): User
    {
        $email = mb_strtolower(trim($email));
        $user = User::query()->where('email', $email)->first();

        if ($user === null || ! $user->hasActivated() || ! Hash::check($password, (string) $user->password)) {
            $this->fail($user, $email, 'invalid_credentials', __('selen.auth.failed'));
        }

        if (! $user->isActive()) {
            $this->fail($user, $email, 'inactive', __('selen.auth.deactivated'));
        }

        return DB::transaction(function () use ($user, $remember) {
            Auth::guard('web')->login($user, $remember);
            $user->forceFill(['last_login_at' => Date::now()])->save();

            $this->events->record(EventType::LoginSucceeded, $user, $user, ['remember' => $remember]);

            return $user;
        });
    }

    private function fail(?User $user, string $email, string $reason, string $message): never
    {
        // Введённый email уходит только в auth_audit (и только если пользователь не найден)
        $this->events->record(EventType::LoginFailed, null, $user, ['reason' => $reason], attemptedEmail: $email);

        throw ValidationException::withMessages(['email' => $message]);
    }
}
