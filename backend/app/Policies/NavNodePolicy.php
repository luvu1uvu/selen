<?php

namespace App\Policies;

use App\Models\NavNode;
use App\Models\User;

/**
 * Дерево навигации ведёт только системный администратор (ADR-0013). Своё дерево (GET /navigation) видит
 * каждый — оно строится по его правам, политика для него не нужна.
 */
class NavNodePolicy
{
    public function manage(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function update(User $actor, NavNode $node): bool
    {
        return $actor->isAdmin();
    }

    /** Удалить пустую папку навсегда (LATER-43). */
    public function delete(User $actor, NavNode $node): bool
    {
        return $actor->isAdmin();
    }
}
