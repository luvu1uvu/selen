<?php

namespace App\Services\Auth;

use App\Enums\UserStatus;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Support\Facades\Date;

/**
 * Замок входа (docs/adr/0024-rights-2.md, П2c): users.status — единственное, что проверяют вход, сброс пароля и
 * EnsureUserIsActive. С деактивацией в компании он следует за членством: deactivated — когда у человека не осталось
 * ни одного действующего «дома» или учётную запись отключил Владелец (blocked_at); иначе — active (или invited, если
 * пароль ещё не задан). Вызывать после изменения «домов», под блокировкой строки пользователя (UserLock) — тогда
 * параллельные изменения его «домов» в разных компаниях не разойдутся.
 */
class AccountStatus
{
    public function __construct(
        private readonly AccessResolver $resolver,
        private readonly UserSessions $sessions,
    ) {}

    public function sync(User $user): void
    {
        // Владелец всегда активен (ограничение БД, ADR-0017) и участник всех компаний
        if ($user->isOwner()) {
            return;
        }

        $homes = $this->resolver->lockActiveHomesCount($user);

        if (($homes === 0 || $user->blocked_at !== null) && $user->status !== UserStatus::Deactivated) {
            $user->forceFill(['status' => UserStatus::Deactivated, 'deactivated_at' => Date::now()])->save();
            $this->sessions->terminate($user);
            // Ждущая смена email уходит вместе со входом (аудит П2c-2, S-2)
            EmailChangeRequest::query()->whereKey($user->getKey())->delete();

            return;
        }

        if ($homes > 0 && $user->blocked_at === null && $user->status === UserStatus::Deactivated) {
            $user->forceFill([
                'status' => $user->hasActivated() ? UserStatus::Active : UserStatus::Invited,
                'deactivated_at' => null,
            ])->save();
        }
    }
}
