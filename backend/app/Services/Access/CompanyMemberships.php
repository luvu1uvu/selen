<?php

namespace App\Services\Access;

use App\Models\Company;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Изменение членства в компаниях (docs/adr/0024-rights-2.md, П2c): «дом» (добавить, убрать из компании и вернуть) и гость
 * (добавить, срок, убрать). Только строки company_members — бизнес-правила, блокировки и события — в Actions; права
 * по членству вычисляет только AccessResolver. Замок входа (users.status) после изменения «домов» —
 * App\Services\Auth\AccountStatus.
 */
class CompanyMemberships
{
    /** Новый «дом» — или гость этой компании становится её сотрудником (выдачи гостя остаются). */
    public function addHome(Company $company, User $user, bool $admin = false): void
    {
        $now = Date::now();
        $updated = DB::table('company_members')
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->where('kind', AccessResolver::GUEST)
            ->update(['kind' => AccessResolver::HOME, 'expires_at' => null, 'is_admin' => $admin, 'updated_at' => $now]);

        if ($updated === 0) {
            DB::table('company_members')->insert([
                'company_id' => $company->getKey(),
                'user_id' => $user->getKey(),
                'kind' => AccessResolver::HOME,
                'is_admin' => $admin,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function addGuest(Company $company, User $user, ?CarbonInterface $expiresAt): void
    {
        $now = Date::now();
        DB::table('company_members')->insert([
            'company_id' => $company->getKey(),
            'user_id' => $user->getKey(),
            'kind' => AccessResolver::GUEST,
            'expires_at' => $expiresAt,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function setGuestExpiry(Company $company, User $user, ?CarbonInterface $expiresAt): void
    {
        $this->guest($company, $user)->update(['expires_at' => $expiresAt, 'updated_at' => Date::now()]);
    }

    /** Строка гостя удаляется: «Убрать гостя» снимает и его выдачи (решение PM 28.10, п. 6 — их снимает Action). */
    public function removeGuest(Company $company, User $user): void
    {
        $this->guest($company, $user)->delete();
    }

    /** «Деактивировать» в компании: «дом» остаётся строкой с отметкой — его выдачи и группы «спят» до возврата. */
    public function deactivateHome(Company $company, User $user): void
    {
        $this->home($company, $user)->update(['deactivated_at' => Date::now(), 'updated_at' => Date::now()]);
    }

    public function reactivateHome(Company $company, User $user): void
    {
        $this->home($company, $user)->update(['deactivated_at' => null, 'updated_at' => Date::now()]);
    }

    private function guest(Company $company, User $user): Builder
    {
        return DB::table('company_members')
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->where('kind', AccessResolver::GUEST);
    }

    private function home(Company $company, User $user): Builder
    {
        return DB::table('company_members')
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->where('kind', AccessResolver::HOME);
    }
}
