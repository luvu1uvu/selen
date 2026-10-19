<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Реактивация ранее активного пользователя. Тому, кто не принял приглашение
 * (приглашение отозвано), нужно отправить приглашение повторно.
 */
class ReactivateUserAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user): User
    {
        return DB::transaction(function () use ($actor, $user) {
            $user = $this->lock->lock($actor, $user);

            if ($user->status !== UserStatus::Deactivated) {
                throw ValidationException::withMessages(['user' => __('selen.users.not_deactivated')]);
            }

            if (! $user->hasActivated()) {
                throw ValidationException::withMessages(['user' => __('selen.users.never_activated')]);
            }

            $user->forceFill(['status' => UserStatus::Active, 'deactivated_at' => null])->save();

            $this->events->record(EventType::UserReactivated, $actor, $user);

            return $user;
        });
    }
}
