<?php

namespace App\Actions\Guests;

use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Spaces\GrantableSpaces;
use App\Actions\Spaces\RemoveSpaceMemberAction;
use App\Actions\Spaces\SpaceGrants;
use App\Actions\Spaces\UpdateSpaceMemberAction;
use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\EventLog\EventRecorder;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Изменить гостя (П2c): срок доступа и его пространства — список заменяет прежний, но только в пространствах, где автор
 * может выдавать доступ (GrantableSpaces): выдачи гостя в остальных не трогаются. Продление истёкшего срока возвращает
 * доступ — его выдачи «спали».
 */
class UpdateGuestAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly GrantableSpaces $grantable,
        private readonly SpaceGrants $grants,
        private readonly AddSpaceMemberAction $addMember,
        private readonly UpdateSpaceMemberAction $updateMember,
        private readonly RemoveSpaceMemberAction $removeMember,
    ) {}

    /**
     * @param  list<array{space: Space, role: SpaceRole, own_cards_only: bool}>  $spaces
     */
    public function handle(User $actor, Company $company, User $guest, ?CarbonInterface $expiresAt, array $spaces): User
    {
        return DB::transaction(function () use ($actor, $company, $guest, $expiresAt, $spaces) {
            $guest = User::query()->lockForUpdate()->findOrFail($guest->id);
            $membership = $this->resolver->membership($company, $guest, lock: true);
            if ($membership?->kind !== AccessResolver::GUEST) {
                throw ValidationException::withMessages(['user' => __('selen.guests.not_guest')]);
            }

            $previous = $membership->expires_at === null ? null : Date::parse($membership->expires_at);
            if ($previous?->toIso8601ZuluString() !== $expiresAt?->toIso8601ZuluString()) {
                $this->memberships->setGuestExpiry($company, $guest, $expiresAt);
                $this->events->record(EventType::GuestUpdated, $actor, $guest, [
                    'expires_at' => $expiresAt?->toIso8601ZuluString(),
                ], company: $company);
            }

            $wanted = collect($spaces)->keyBy(fn (array $grant) => $grant['space']->id);
            foreach ($this->grantable->of($actor, $company) as $space) {
                $current = $this->grants->personal($space, $guest);
                $grant = $wanted->get($space->id);
                if ($grant === null) {
                    if ($current !== null) {
                        $this->removeMember->handle($actor, $space, $guest);
                    }

                    continue;
                }

                $current === null
                    ? $this->addMember->handle($actor, $space, $guest, $grant['role'], AddGuestAction::VIA, $grant['own_cards_only'])
                    : $this->updateMember->handle($actor, $space, $guest, $grant['role'], $grant['own_cards_only']);
            }

            return $guest;
        });
    }
}
