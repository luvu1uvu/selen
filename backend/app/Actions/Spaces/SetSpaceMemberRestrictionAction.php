<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Режим «только свои карточки» для участника (ADR-0008): ограничение доступа, а не фильтр.
 * Применим к ролям editor и commenter; администратор пространства видит всё. В модели прав (ADR-0024) —
 * смена стандартной роли на вариант «— только свои карточки» и обратно.
 */
class SetSpaceMemberRestrictionAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
        private readonly SpaceGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, User $user, bool $ownCardsOnly): AccessGrant
    {
        return DB::transaction(function () use ($actor, $space, $user, $ownCardsOnly) {
            $space = $this->guard->lock($space);
            $grant = $this->grants->personal($space, $user) ?? throw (new ModelNotFoundException)->setModel(AccessGrant::class);
            $role = $grant->standardRole()->legacyRole();

            if ($grant->standardRole()->ownCardsOnly() === $ownCardsOnly) {
                return $grant;
            }

            if ($ownCardsOnly && $role->canManageSpace()) {
                throw ValidationException::withMessages(['own_cards_only' => __('selen.spaces.admin_not_restricted')]);
            }

            $grant = $this->grants->changeRole($grant, StandardRole::fromLegacy($role, $ownCardsOnly));

            $this->events->record(EventType::SpaceMemberRestrictionChanged, $actor, $space, [
                'user_id' => $user->id,
                'from' => ! $ownCardsOnly,
                'to' => $ownCardsOnly,
            ]);

            return $grant;
        });
    }
}
