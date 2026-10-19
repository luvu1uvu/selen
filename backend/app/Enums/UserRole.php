<?php

namespace App\Enums;

/**
 * Системная роль (docs/adr/0017-owner-role.md). Владелец и администратор — системные администраторы
 * (User::isAdmin()); исключительные права Владельца — User::isOwner() и политики. Доступа к содержимому
 * пространств системная роль не даёт (ADR-0005).
 */
enum UserRole: string
{
    case Owner = 'owner';
    case Admin = 'admin';
    case Member = 'member';

    /** Роли, которые назначаются сменой роли и приглашением. Владелец — только передачей владения. */
    public const ASSIGNABLE = [self::Admin, self::Member];

    public function isSystemAdmin(): bool
    {
        return $this === self::Owner || $this === self::Admin;
    }

    /** @return list<self> */
    public static function systemAdmins(): array
    {
        return [self::Owner, self::Admin];
    }
}
