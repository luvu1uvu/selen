<?php

namespace App\Actions\Invitations;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Services\EventLog\EventRecorder;
use App\Services\Invitations\InvitationIssuer;
use Illuminate\Support\Facades\DB;

/**
 * Приглашение нового сотрудника: создаётся пользователь со статусом invited
 * и приглашение с одноразовым токеном; письмо уходит через очередь.
 * Уникальность email проверяет Form Request.
 */
class InviteUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly InvitationIssuer $issuer,
    ) {}

    public function handle(User $inviter, string $name, string $email, UserRole $role): Invitation
    {
        $issued = DB::transaction(function () use ($inviter, $name, $email, $role) {
            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'role' => $role,
                'status' => UserStatus::Invited,
                'timezone' => config('selen.default_timezone'),
            ]);

            $issued = $this->issuer->issue($user, $inviter);

            $this->events->record(EventType::UserInvited, $inviter, $user, [
                'invitation_id' => $issued->invitation->id,
                'role' => $role->value,
                'expires_at' => $issued->invitation->expires_at->toIso8601ZuluString(),
            ]);

            return $issued;
        });

        // Письмо — только после успешной фиксации транзакции
        $issued->invitation->user->notify(new InvitationNotification($issued->invitation, $issued->token));

        return $issued->invitation;
    }
}
