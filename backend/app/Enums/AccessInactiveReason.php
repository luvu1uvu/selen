<?php

namespace App\Enums;

/**
 * Почему источник доступа к пространству не действует — сводка админки «почему он видит / не видит»
 * (AccessResolver::explain, ADR-0012). Значения — в API (`inactive_reason`), не переименовываем.
 */
enum AccessInactiveReason: string
{
    /** Группа в архиве. */
    case GroupArchived = 'group_archived';

    /** Пользователь деактивирован или убран из компании (П2c — тогда не действуют и личные источники). */
    case UserDeactivated = 'user_deactivated';

    /** Гость: срок доступа истёк (П2c) — не действуют его выдачи в этой компании. */
    case GuestExpired = 'guest_expired';

    /** «Все сотрудники»: приглашённый входит в группу только после принятия приглашения. */
    case UserInvited = 'user_invited';
}
