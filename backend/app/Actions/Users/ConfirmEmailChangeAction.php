<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Notifications\EmailChangedNotification;
use App\Services\Auth\UserSessions;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Подтверждение нового email по ссылке из письма (П2c-2, LATER-9; страница без входа). Email учётной записи меняется,
 * ссылки сброса пароля на прежний адрес перестают работать, все сеансы человека завершаются — войти можно уже с новым
 * адресом и прежним паролем. На прежний адрес — уведомление. Событие auth.email_changed — «о человеке», без адресов; IP
 * и браузер того, кто перешёл по ссылке, — в auth_audit.
 */
class ConfirmEmailChangeAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserSessions $sessions,
    ) {}

    /** Запрос по токену из ссылки — ещё действующий; иначе 422 (одинаково для «нет такого» и «истёк»). */
    public function findUsable(#[\SensitiveParameter] string $token): EmailChangeRequest
    {
        $request = EmailChangeRequest::findByToken($token);
        if ($request === null || $request->isExpired()) {
            throw ValidationException::withMessages(['token' => __('selen.email_change.link_invalid')]);
        }

        return $request;
    }

    public function handle(#[\SensitiveParameter] string $token): User
    {
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
}
