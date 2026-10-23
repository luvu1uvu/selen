<?php

namespace App\Enums;

/**
 * Роль человека в компании (ADR-0024): администратор компании (company_members.is_admin, назначает только Владелец)
 * или участник. В API — поле role у людей админки, приглашений и смены роли (прежние значения admin | member;
 * у Владельца в ответах role — owner). Владелец так не назначается — только передачей владения (ADR-0017).
 */
enum CompanyRole: string
{
    case Admin = 'admin';
    case Member = 'member';

    public static function of(bool $isAdmin): self
    {
        return $isAdmin ? self::Admin : self::Member;
    }
}
