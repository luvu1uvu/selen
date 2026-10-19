<?php

namespace App\Services\Invitations;

use App\Models\Invitation;

/**
 * Только что выпущенное приглашение и токен в открытом виде.
 * Токен существует только в памяти — для письма; в БД его нет.
 */
final readonly class IssuedInvitation
{
    public function __construct(
        public Invitation $invitation,
        #[\SensitiveParameter] public string $token,
    ) {}
}
