<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\AccessGrant;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Исключение из пространства: удаляется личная выдача (доступ), пользователь остаётся.
 * Факт и прежняя роль сохраняются в журнале событий.
 */
class RemoveSpaceMemberAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly SpaceAdminGuard $guard,
        private readonly SpaceGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, User $user): void
    {
        DB::transaction(function () use ($actor, $space, $user) {
            $space = $this->guard->lock($space);
            $grant = $this->grants->personal($space, $user) ?? throw (new ModelNotFoundException)->setModel(AccessGrant::class);
            $role = $this->grants->standardRoleOf($grant)->legacyRole();

            if ($this->guard->managesAccess($grant)) {
                $this->guard->ensureAnotherAdminRemains($space, $user);
            }

            $grant->delete();

            $this->events->record(EventType::SpaceMemberRemoved, $actor, $space, [
                'user_id' => $user->id,
                'role' => $role->value,
            ]);
        });
    }
}
