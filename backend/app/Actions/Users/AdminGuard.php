<?php

namespace App\Actions\Users;

use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Validation\ValidationException;

/**
 * Инвариант «компания не остаётся без администратора»: снять администратора компании или деактивировать его можно,
 * только если у компании останется другой действующий администратор (Владелец — администратор всех компаний,
 * ADR-0017, ADR-0024).
 */
class AdminGuard
{
    public function __construct(private readonly AccessResolver $resolver) {}

    public function ensureAnotherActiveAdminExists(User $user, Company $company): void
    {
        // FOR UPDATE нельзя совмещать с count() в PostgreSQL — блокируем строки и считаем в PHP
        // @phpstan-ignore-next-line larastan.noUnnecessaryCollectionCall
        $otherAdmins = $this->resolver->activeAdmins($company)
            ->whereKeyNot($user->getKey())
            ->lockForUpdate()
            ->pluck('id')
            ->count();

        if ($otherAdmins === 0) {
            throw ValidationException::withMessages(['user' => __('selen.users.last_admin')]);
        }
    }
}
