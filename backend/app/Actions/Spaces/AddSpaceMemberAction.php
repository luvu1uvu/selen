<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Добавление участника в пространство — личная выдача со стандартной ролью (ADR-0024).
 *
 * $via фиксирует в журнале, откуда пришло назначение: из пространства (null), при создании
 * пространства (space_created) или из админки системным администратором (admin_panel).
 */
class AddSpaceMemberAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
        private readonly SpaceGrants $grants,
        private readonly AccessResolver $resolver,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role, ?string $via = null, bool $ownCardsOnly = false): AccessGrant
    {
        return DB::transaction(function () use ($actor, $space, $user, $role, $via, $ownCardsOnly) {
            $space = $this->guard->lock($space);

            // Деактивированный или убранный из компании пространства (П2c) — выдача «спала» бы
            if ($user->isDeactivated() || ! $this->resolver->isActiveParticipant($space->company_id, $user)) {
                throw ValidationException::withMessages(['user_id' => __('selen.spaces.member_deactivated')]);
            }

            // Гостю — только роли без «управления доступом» (ADR-0024; в БД — триггер access_grants_guest_check)
            if ($role->canManageSpace() && $this->resolver->isGuest($space->company_id, $user)) {
                throw ValidationException::withMessages(['role' => __('selen.guests.no_manage_access')]);
            }

            if ($this->grants->personal($space, $user) !== null) {
                throw ValidationException::withMessages(['user_id' => __('selen.spaces.already_member')]);
            }

            $grant = $this->grants->create($actor, $space, $user, StandardRole::fromLegacy($role, ! $role->canManageSpace() && $ownCardsOnly));

            $this->events->record(EventType::SpaceMemberAdded, $actor, $space, array_filter([
                'user_id' => $user->id,
                'role' => $role->value,
                'via' => $via,
            ]));

            return $grant;
        });
    }
}
