<?php

namespace App\Actions\Invitations;

use App\Actions\Users\UserLock;
use App\Enums\EventType;
use App\Enums\InvitationState;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationNotification;
use App\Services\Access\CompanyMemberships;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use App\Services\Invitations\InvitationIssuer;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Повторная отправка приглашения: выпускается новое приглашение с новым токеном и сроком,
 * прежнее помечается как заменённое (его ссылка перестаёт работать).
 *
 * Работает и для отозванного приглашения: пользователь снова получает статус invited.
 */
class ResendInvitationAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly InvitationIssuer $issuer,
        private readonly UserLock $lock,
        private readonly CompanyMemberships $memberships,
        private readonly AccountStatus $accountStatus,
    ) {}

    public function handle(User $actor, Invitation $previous, Company $company): Invitation
    {
        // Роль приглашённого — та, по которой политика пустила (приглашённым админом управляет только Владелец)
        $authorized = $previous->user;

        $issued = DB::transaction(function () use ($actor, $previous, $authorized, $company) {
            $previous = Invitation::query()->lockForUpdate()->findOrFail($previous->id);
            $user = $this->lock->lock($actor, $authorized, $company);

            $this->ensureCanResend($previous, $user, $company);
            // Отключённому Владельцем приглашение не поможет — сначала его должен включить Владелец (аудит П2c-1, S-5)
            if ($user->isBlocked()) {
                throw ValidationException::withMessages(['invitation' => __('selen.users.blocked')]);
            }
            $previousState = $previous->state();

            $issued = $this->issuer->issue($company, $user, $actor);

            $previous->forceFill([
                'superseded_by_id' => $issued->invitation->id,
                'revoked_at' => $previous->revoked_at ?? Date::now(),
            ])->save();

            // Отозванное приглашение: человек снова «дом» этой компании, учётная запись — invited (AccountStatus)
            $this->memberships->reactivateHome($company, $user);
            $this->accountStatus->sync($user);

            $this->events->record(EventType::InvitationResent, $actor, $issued->invitation, [
                'user_id' => $user->id,
                'previous_invitation_id' => $previous->id,
                'previous_state' => $previousState->value,
                'expires_at' => $issued->invitation->expires_at->toIso8601ZuluString(),
            ]);

            return $issued;
        });

        $issued->invitation->user->notify(new InvitationNotification($issued->invitation, $issued->token));

        return $issued->invitation;
    }

    private function ensureCanResend(Invitation $invitation, User $user, Company $company): void
    {
        // Последнее приглашение — этой компании (аудит П2b-2, S-4)
        Invitation::rememberLatestIn($company, [$user]);
        $isLatest = $user->latestInvitation?->is($invitation) ?? false;

        if (! $isLatest || $user->hasActivated() || $invitation->state() === InvitationState::Accepted) {
            throw ValidationException::withMessages([
                'invitation' => __('selen.invitations.cannot_resend'),
            ]);
        }
    }
}
