<?php

namespace App\Actions\Invitations;

use App\Enums\CompanyRole;
use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use App\Services\Invitations\InvitationIssuer;
use Illuminate\Support\Facades\DB;

/**
 * Приглашение нового сотрудника в компанию: создаётся пользователь со статусом invited, его «дом» в компании
 * (администратор компании — если приглашён с ролью admin, ADR-0024) и приглашение с одноразовым токеном; письмо
 * уходит через очередь. Уникальность email проверяет Form Request.
 */
class InviteUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly InvitationIssuer $issuer,
    ) {}

    public function handle(User $inviter, Company $company, string $name, string $email, CompanyRole $role): Invitation
    {
        $issued = DB::transaction(function () use ($inviter, $company, $name, $email, $role) {
            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'role' => UserRole::Member,
                'status' => UserStatus::Invited,
                'timezone' => config('selen.default_timezone'),
            ]);
            $company->users()->attach($user->id, ['kind' => AccessResolver::HOME, 'is_admin' => $role === CompanyRole::Admin]);

            $issued = $this->issuer->issue($company, $user, $inviter);

            $this->events->record(EventType::UserInvited, $inviter, $user, [
                'invitation_id' => $issued->invitation->id,
                'role' => $role->value,
                'expires_at' => $issued->invitation->expires_at->toIso8601ZuluString(),
            ], company: $company);

            return $issued;
        });

        // Письмо — только после успешной фиксации транзакции
        $issued->invitation->user->notify(new InvitationNotification($issued->invitation, $issued->token));

        return $issued->invitation;
    }
}
