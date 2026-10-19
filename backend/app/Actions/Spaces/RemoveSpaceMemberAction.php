<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Исключение из пространства: удаляется строка участия (доступ), пользователь остаётся.
 * Факт и прежняя роль сохраняются в журнале событий.
 */
class RemoveSpaceMemberAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
    ) {}

    public function handle(User $actor, Space $space, User $user): void
    {
        DB::transaction(function () use ($actor, $space, $user) {
            $space = $this->guard->lock($space);
            $member = $space->members()->where('user_id', $user->getKey())->firstOrFail();

            if ($member->role === SpaceRole::Admin) {
                $this->guard->ensureAnotherAdminRemains($space, $user);
            }

            $member->delete();

            $this->events->record(EventType::SpaceMemberRemoved, $actor, $space, [
                'user_id' => $user->id,
                'role' => $member->role->value,
            ]);
        });
    }
}
