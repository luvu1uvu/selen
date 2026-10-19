<?php

namespace App\Actions\Invitations;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Exceptions\InvitationException;
use App\Models\Invitation;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Принятие приглашения: пользователь задаёт пароль, учётная запись активируется,
 * выполняется вход. Регенерацию сессии выполняет контроллер.
 */
class AcceptInvitationAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * Найти приглашение по токену и убедиться, что его можно принять.
     *
     * @throws InvitationException
     */
    public function findUsable(#[\SensitiveParameter] string $token): Invitation
    {
        $invitation = Invitation::findByToken($token);

        if ($invitation === null) {
            throw InvitationException::invalid();
        }

        InvitationException::throwUnlessUsable($invitation);

        return $invitation;
    }

    public function handle(#[\SensitiveParameter] string $token, #[\SensitiveParameter] string $password): User
    {
        return DB::transaction(function () use ($token, $password) {
            $invitation = $this->findUsable($token);
            // Блокируем строку: двойной клик не должен принять приглашение дважды
            $invitation = Invitation::query()->lockForUpdate()->findOrFail($invitation->id);
            InvitationException::throwUnlessUsable($invitation);

            $user = $invitation->user;
            $now = Date::now();

            $user->forceFill([
                'password' => $password,
                'status' => UserStatus::Active,
                'last_login_at' => $now,
            ])->save();
            $invitation->forceFill(['accepted_at' => $now])->save();

            $this->events->record(EventType::InvitationAccepted, $user, $invitation, ['user_id' => $user->id]);

            Auth::guard('web')->login($user);
            $this->events->record(EventType::LoginSucceeded, $user, $user, ['via' => 'invitation']);

            return $user;
        });
    }
}
