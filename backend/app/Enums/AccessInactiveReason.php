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

    /** Пользователь деактивирован — групповые источники у него не действуют. */
    case UserDeactivated = 'user_deactivated';

    /** «Все сотрудники»: приглашённый входит в группу только после принятия приглашения. */
    case UserInvited = 'user_invited';
}
