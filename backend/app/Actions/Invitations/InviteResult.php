<?php

namespace App\Actions\Invitations;

use App\Models\Invitation;
use App\Models\User;

/**
 * Итог приглашения (П2c): invited — новому человеку (или ещё не задавшему пароль) ушла ссылка задать пароль; added —
 * существующая учётная запись сразу получила «дом» в компании (В8), ей ушло письмо со ссылкой на вход.
 */
final readonly class InviteResult
{
    public const INVITED = 'invited';

    public const ADDED = 'added';

    public function __construct(
        public string $result,
        public User $user,
        public ?Invitation $invitation = null,
    ) {}
}
