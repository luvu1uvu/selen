<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Режим «только свои карточки» для участника (ADR-0008): ограничение доступа, а не фильтр.
 * Применим к ролям editor и commenter; администратор пространства видит всё.
 */
class SetSpaceMemberRestrictionAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(User $actor, Space $space, User $user, bool $ownCardsOnly): SpaceMember
    {
        return DB::transaction(function () use ($actor, $space, $user, $ownCardsOnly) {
            $space = $this->guard->lock($space);
            $member = $space->members()->where('user_id', $user->getKey())->firstOrFail();

            if ($member->own_cards_only === $ownCardsOnly) {
                return $member;
            }

            if ($ownCardsOnly && $member->role->canManageSpace()) {
                throw ValidationException::withMessages(['own_cards_only' => __('selen.spaces.admin_not_restricted')]);
            }

            $member->update(['own_cards_only' => $ownCardsOnly]);
            $this->events->record(EventType::SpaceMemberRestrictionChanged, $actor, $space, [
                'user_id' => $user->id,
                'from' => ! $ownCardsOnly,
                'to' => $ownCardsOnly,
            ]);

            return $member;
        });
    }
}
