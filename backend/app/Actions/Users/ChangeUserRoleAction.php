<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Смена системной роли: участник ↔ администратор. Роль Владельца так не назначается и не снимается —
 * только передачей владения (TransferOwnershipAction, ADR-0017). Кто может — UserPolicy::updateRole.
 */
class ChangeUserRoleAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AdminGuard $adminGuard,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user, UserRole $role): User
    {
        return DB::transaction(function () use ($actor, $user, $role) {
            $user = $this->lock->lock($actor, $user);
            $from = $user->role;

            if ($from === UserRole::Owner || $role === UserRole::Owner) {
                throw ValidationException::withMessages(['role' => __('selen.users.owner_role_by_transfer')]);
            }

            if ($from === $role) {
                return $user;
            }

            // Снятие администратора (Владелец сюда не доходит — выше)
            if ($from === UserRole::Admin) {
                $this->adminGuard->ensureAnotherActiveAdminExists($user);
            }

            $user->forceFill(['role' => $role])->save();

            $this->events->record(EventType::UserRoleChanged, $actor, $user, [
                'from' => $from->value,
                'to' => $role->value,
            ]);

            return $user;
        });
    }
}
