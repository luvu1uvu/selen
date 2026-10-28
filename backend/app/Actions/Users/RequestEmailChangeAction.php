<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Notifications\EmailChangeConfirmationNotification;
use App\Notifications\EmailChangeRequestedNotification;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Смена email администратором (LATER-9, решение PM 28.10): email меняется не сразу, а когда по ссылке из письма на новый
 * адрес перейдут (ConfirmEmailChangeAction) — опечатка не уведёт учётную запись. До этого вход и сброс пароля — по
 * прежнему адресу. На прежний адрес сразу уходит уведомление (новый адрес — маской): захват учётной записи
 * администратором, который поставил свой адрес, человек увидит сразу, а Владелец — в журнале. Новый запрос заменяет
 * прежний. Событие — без адресов.
 */
class RequestEmailChangeAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user, Company $company, string $email): User
    {
        $email = mb_strtolower(trim($email));

        [$user, $token, $expiresAt] = DB::transaction(function () use ($actor, $user, $company, $email) {
            $user = $this->lock->lock($actor, $user, $company);

            if ($user->status === UserStatus::Invited) {
                throw ValidationException::withMessages(['email' => __('selen.email_change.invited')]);
            }
            if ($user->email === $email) {
                throw ValidationException::withMessages(['email' => __('selen.email_change.same')]);
            }
            $taken = User::query()->where('email', $email)->exists()
                || EmailChangeRequest::query()->where('new_email', $email)->whereKeyNot($user->id)->exists();
            if ($taken) {
                throw ValidationException::withMessages(['email' => __('selen.email_change.taken')]);
            }

            EmailChangeRequest::query()->whereKey($user->id)->delete();
            $token = Str::random(64);
            $expiresAt = Date::now()->addHours((int) config('selen.email_change.ttl_hours'));
            try {
                EmailChangeRequest::query()->create([
                    'user_id' => $user->id,
                    'new_email' => $email,
                    'token_hash' => EmailChangeRequest::hashToken($token),
                    'requested_by_id' => $actor->id,
                    'expires_at' => $expiresAt,
                ]);
            } catch (UniqueConstraintViolationException) {
                // Тот же адрес только что запросили другому сотруднику
                throw ValidationException::withMessages(['email' => __('selen.email_change.taken')]);
            }

            $this->events->record(EventType::UserEmailChangeRequested, $actor, $user, company: $company);

            return [$user, $token, $expiresAt];
        });

        // Письма — после фиксации: адреса — явно, а не из модели (очередь перечитала бы её, когда email уже сменился)
        Notification::route('mail', $email)
            ->notify(new EmailChangeConfirmationNotification($user->name, $user->timezone, $token, $expiresAt));
        Notification::route('mail', $user->email)
            ->notify(new EmailChangeRequestedNotification($user->name, $actor->name, EmailChangeRequest::mask($email)));

        return $user->load('emailChangeRequest');
    }
}
