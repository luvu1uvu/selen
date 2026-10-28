<?php

namespace App\Services\Access;

use App\Enums\Permission;

/**
 * Права пользователя в компании (docs/adr/0024-rights-2.md): участник ли он админки (действующий «дом» или Владелец;
 * гость и убранный из компании — нет), администратор ли, есть ли у него «дома» и в других компаниях и какие права
 * компании у него есть. Владелец — участник всех компаний со всеми правами компании; администратор компании — набор по
 * умолчанию (Permission::companyAdminDefaults); плюс права, выданные лично и через группы (П2c). Доступа к содержимому
 * пространств права компании не дают (ADR-0005).
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
        public bool $assignedAdmin = false,
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
     * Назначен администратором компании — и тогда, когда убран из неё (роль в списке «Пользователи»; управляет им только
     * Владелец, ADR-0017). Права администратора — только у действующего (isAdmin()).
     */
    public function isAssignedAdmin(): bool
    {
        return $this->assignedAdmin;
    }

    /**
     * Действующий «дом» ещё и в другой компании. С деактивацией в компании (П2c) этим ничего не ограничено; учётная
     * запись общая — смена её email у такого человека — только Владелец (П2c-2, решение PM 28.10, п. 8).
     */
    public function hasOtherHomes(): bool
    {
        return $this->otherHomes;
    }
}
