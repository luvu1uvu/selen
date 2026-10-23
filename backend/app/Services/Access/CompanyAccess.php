<?php

namespace App\Services\Access;

use App\Enums\Permission;

/**
 * Права пользователя в компании (docs/adr/0024-rights-2.md): участник ли он (действующее членство или Владелец),
 * администратор ли и какие права компании у него есть. Владелец — участник всех компаний со всеми правами компании;
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
}
