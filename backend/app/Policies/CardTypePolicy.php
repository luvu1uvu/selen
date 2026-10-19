<?php

namespace App\Policies;

use App\Models\CardType;
use App\Models\User;

/**
 * Справочник типов карточек: читают все, меняет только системный администратор.
 */
class CardTypePolicy
{
    public function manage(User $actor, ?CardType $type = null): bool
    {
        return $actor->isAdmin();
    }
}
