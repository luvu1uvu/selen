<?php

namespace App\Enums;

/**
 * Состояние приглашения. Не хранится в БД, а вычисляется из дат (см. Invitation::state()).
 */
enum InvitationState: string
{
    case Pending = 'pending';
    case Expired = 'expired';
    case Accepted = 'accepted';
    case Revoked = 'revoked';
    /** Заменено новым приглашением при повторной отправке. */
    case Superseded = 'superseded';
}
