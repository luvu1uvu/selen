<?php

namespace App\Actions\Users;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Защита от ситуации «в системе не осталось ни одного активного администратора». Владелец — тоже
 * администратор (ADR-0017); пока он есть, проверка проходит всегда — она страхует базу без Владельца.
 */
class AdminGuard
{
    public function ensureAnotherActiveAdminExists(User $user): void
    {
        // FOR UPDATE нельзя совмещать с count() в PostgreSQL — блокируем строки и считаем в PHP
        // @phpstan-ignore-next-line larastan.noUnnecessaryCollectionCall
        $otherAdmins = User::query()
            ->whereIn('role', UserRole::systemAdmins())
            ->where('status', UserStatus::Active)
            ->whereKeyNot($user->getKey())
            ->lockForUpdate()
            ->pluck('id')
            ->count();

        if ($otherAdmins === 0) {
            throw ValidationException::withMessages(['user' => __('selen.users.last_admin')]);
        }
    }
}
