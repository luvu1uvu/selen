<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * Подтверждение нового email по ссылке из письма (П2c-2, LATER-9; страница без входа). Подтверждает сам человек — своим
 * нынешним паролем (решение PM 28.10 по ревью П2c-2): ни администратор, поставивший свой адрес, ни посторонний, которому
 * письмо ушло по опечатке, учётную запись не заберут. Email меняется, ссылки сброса пароля на прежний адрес перестают
 * работать, все сеансы человека завершаются — войти можно уже с новым адресом и тем же паролем. На прежний адрес —
 * уведомление. Событие auth.email_changed — «о человеке», без адресов; IP и браузер — в auth_audit.
 */
class ConfirmEmailChangeAction
{
    /** Подбор пароля по ссылке: попыток в минуту на учётную запись (как у входа по email). */
    private const PASSWORD_ATTEMPTS = 5;

    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
    ) {}

    /**
     * Запрос по токену из ссылки — ещё действующий; иначе 422, одинаково для «нет такого», «истёк» и «человек больше не
     * может войти или стал Владельцем» (до проверки пароля — аудит П2c-2, S-2: иначе по ответу можно было бы проверять
     * пароль Владельца или отключённого).
     */
    public function findUsable(#[\SensitiveParameter] string $token): EmailChangeRequest
    {
        $request = EmailChangeRequest::findByToken($token);
        $user = $request?->user;
        if ($request === null || $request->isExpired() || $user === null || $user->isOwner() || $user->isBlocked()
            || $user->status !== UserStatus::Active) {
            throw ValidationException::withMessages(['token' => __('selen.email_change.link_invalid')]);
        }

        return $request;
    }

    public function handle(#[\SensitiveParameter] string $token, #[\SensitiveParameter] string $password): User
    {
        $this->checkPassword($this->findUsable($token)->user_id, $password);

        [$user, $oldEmail] = DB::transaction(function () use ($token) {
            $request = $this->findUsable($token);
            // Строка человека, затем запроса — в том же порядке, что и при запросе смены (UserLock)
            $user = User::query()->lockForUpdate()->findOrFail($request->user_id);
            $request = EmailChangeRequest::query()->lockForUpdate()->find($user->id);
            // Запрос заменили, отменили или уже подтвердили; человек за это время стал Владельцем (им не управляет никто)
            if ($request === null || ! hash_equals($request->token_hash, EmailChangeRequest::hashToken($token))
                || $request->isExpired() || $user->isOwner()) {
                throw ValidationException::withMessages(['token' => __('selen.email_change.link_invalid')]);
            }
            if (User::query()->where('email', $request->new_email)->exists()) {
                throw ValidationException::withMessages(['token' => __('selen.email_change.link_taken')]);
            }

            $oldEmail = $user->email;
            try {
                $user->forceFill(['email' => $request->new_email])->save();
            } catch (UniqueConstraintViolationException) {
                throw ValidationException::withMessages(['token' => __('selen.email_change.link_taken')]);
            }
            $requestedBy = $request->requested_by_id;
            $request->delete();
            // Ссылка сброса пароля, отправленная на прежний адрес, больше не подходит
            DB::table(config('auth.passwords.users.table'))->where('email', $oldEmail)->delete();
            $this->sessions->terminate($user);

            $this->events->record(EventType::EmailChanged, null, $user, ['requested_by_id' => $requestedBy]);

            return [$user, $oldEmail];
        });

        Notification::route('mail', $oldEmail)
            ->notify(new EmailChangedNotification($user->name, EmailChangeRequest::mask($user->email)));

        return $user;
    }

    /** Нынешний пароль учётной записи — не больше PASSWORD_ATTEMPTS попыток в минуту; неверные тоже считаются. */
    private function checkPassword(string $userId, #[\SensitiveParameter] string $password): void
    {
        $key = 'email-change-password:'.$userId;
        if (RateLimiter::tooManyAttempts($key, self::PASSWORD_ATTEMPTS)) {
            throw ValidationException::withMessages(['password' => __('selen.email_change.password_throttle', [
                'seconds' => RateLimiter::availableIn($key),
            ])]);
        }
        RateLimiter::hit($key);

        $user = User::query()->findOrFail($userId);
        if (! Hash::check($password, (string) $user->password)) {
            // Подбор пароля по ссылке виден в журнале, с IP и браузером (аудит П2c-2, S-1)
            $this->events->record(EventType::EmailChangePasswordFailed, null, $user);

            throw ValidationException::withMessages(['password' => __('selen.email_change.password')]);
        }
        RateLimiter::clear($key);
    }
}
