<?php

namespace App\Enums;

/**
 * Системная роль (docs/adr/0017-owner-role.md, ADR-0024): Владелец — один на весь Selen, остальные — участники.
 * Глобального системного администратора нет: администратор компании — company_members.is_admin
 * (User::administers(), CompanyRole). Исключительные права Владельца — User::isOwner() и политики. Доступа
 * к содержимому пространств системная роль не даёт (ADR-0005).
 */
enum UserRole: string
{
    case Owner = 'owner';
    case Member = 'member';
}
