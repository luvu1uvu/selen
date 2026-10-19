<?php

namespace App\Policies;

use App\Models\BoardColumn;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/** Колонки — структура доски: только администратор пространства. */
class BoardColumnPolicy
{
    use ChecksSpaceRole;

    public function manage(User $actor, BoardColumn $column): Response
    {
        return $this->allowBoardStructure($actor, $column->board);
    }
}
