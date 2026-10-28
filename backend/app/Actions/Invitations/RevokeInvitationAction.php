<?php

namespace App\Actions\Invitations;

use App\Actions\Users\UserLock;
use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Access\CompanyMemberships;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Отзыв приглашения: ссылка перестаёт работать, человек убран из этой компании (П2c); без других «домов» учётная
 * запись переходит в deactivated.
 * В админке такой пользователь отличается от деактивированного бейджем «Приглашение отозвано».
 */
class RevokeInvitationAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
        private readonly CompanyMemberships $memberships,
        private readonly AccountStatus $accountStatus,
    ) {}

    public function handle(User $actor, Invitation $invitation, Company $company): Invitation
    {
        // Роль приглашённого — та, по которой политика пустила (приглашённым админом управляет только Владелец)
        $authorized = $invitation->user;

        return DB::transaction(function () use ($actor, $invitation, $authorized, $company) {
            $invitation = Invitation::query()->lockForUpdate()->findOrFail($invitation->id);
            $user = $this->lock->lock($actor, $authorized, $company);

            if (! $invitation->isOpen() || $user->status !== UserStatus::Invited) {
                throw ValidationException::withMessages([
                    'invitation' => __('selen.invitations.cannot_revoke'),
                ]);
            }

            $invitation->forceFill(['revoked_at' => Date::now()])->save();
            // Человек убран из этой компании; учётная запись без других «домов» — deactivated (AccountStatus)
            $this->memberships->deactivateHome($company, $user);
            $this->accountStatus->sync($user);

            $this->events->record(EventType::InvitationRevoked, $actor, $invitation, [
                'user_id' => $user->id,
            ]);

            return $invitation;
        });
    }
}
