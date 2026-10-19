<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Добавление участника в пространство.
 *
 * $via фиксирует в журнале, откуда пришло назначение: из пространства (null), при создании
 * пространства (space_created) или из админки системным администратором (admin_panel).
 */
class AddSpaceMemberAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(User $actor, Space $space, User $user, SpaceRole $role, ?string $via = null): SpaceMember
    {
        return DB::transaction(function () use ($actor, $space, $user, $role, $via) {
            $space = $this->guard->lock($space);

            if ($user->isDeactivated()) {
                throw ValidationException::withMessages(['user_id' => __('selen.spaces.member_deactivated')]);
            }

            if ($space->members()->where('user_id', $user->getKey())->exists()) {
                throw ValidationException::withMessages(['user_id' => __('selen.spaces.already_member')]);
            }

            $member = SpaceMember::query()->create([
                'space_id' => $space->id,
                'user_id' => $user->id,
                'role' => $role,
            ]);

            $this->events->record(EventType::SpaceMemberAdded, $actor, $space, array_filter([
                'user_id' => $user->id,
                'role' => $role->value,
                'via' => $via,
            ]));

            return $member;
        });
    }
}
