<?php

namespace App\Policies;

use App\Models\User;

class EventLogEntryPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
