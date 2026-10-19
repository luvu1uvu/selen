<?php

namespace App\Policies;

use App\Models\Lane;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/** Дорожки — структура доски: только администратор пространства. */
class LanePolicy
{
    use ChecksSpaceRole;

    public function manage(User $actor, Lane $lane): Response
    {
        return $this->allowBoardStructure($actor, $lane->board);
    }
}
