<?php

namespace App\Services\Access;

use App\Enums\Permission;

/**
 * Права пользователя в компании (docs/adr/0024-rights-2.md): участник ли он (действующее членство или Владелец),
 * администратор ли, есть ли у него «дома» и в других компаниях и какие права компании у него есть. Владелец — участник всех компаний со всеми правами компании;
 * администратор компании — набор по умолчанию (Permission::companyAdminDefaults). Выдача прав компании лично и группам —
 * П2c. Доступа к содержимому пространств права компании не дают (ADR-0005).
 *
 * Объект строит только AccessResolver; читают его политики админки (ChecksCompanyPermission).
 */
final readonly class CompanyAccess
{
    /**
     * @param  array<string, true>  $permissions  права компании (значения Permission)
     */
    public function __construct(
        public bool $member = false,
        public bool $admin = false,
        public bool $owner = false,
        private array $permissions = [],
        public bool $otherHomes = false,
    ) {}

    public static function none(): self
    {
        return new self;
    }

    /** Участник компании: её «дом» или Владелец. Иначе компании для него нет (404). */
    public function isMember(): bool
    {
        return $this->member;
    }

    /** Администратор компании или Владелец. */
    public function isAdmin(): bool
    {
        return $this->admin;
    }

    public function allows(Permission $permission): bool
    {
        return isset($this->permissions[$permission->value]);
    }

    /**
     * Права компании списком (значения Permission): /auth/me — пункты меню админки по правам компании.
     *
     * @return list<string>
     */
    public function permissions(): array
    {
        return array_keys($this->permissions);
    }

    /**
     * «Дом» ещё и в другой компании: учётной записью такого человека (деактивация, возврат) управляет только Владелец —
     * до «деактивации в компании» (П2c; решение PM 26.10).
     */
    public function hasOtherHomes(): bool
    {
        return $this->otherHomes;
    }
}
