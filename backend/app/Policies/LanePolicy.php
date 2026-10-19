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

    /**
     * Видеть дорожку — как доску (BoardPolicy::view: участник пространства, не участник — 404). Архивной дорожки на
     * доске нет — тоже 404. Нужно личному сворачиванию дорожки: это вид, а не изменение доски (ADR-0019).
     */
    public function view(User $actor, Lane $lane): Response
    {
        return $lane->isArchived() ? Response::denyAsNotFound() : $this->allowMember($actor, $lane->board->space);
    }

    public function manage(User $actor, Lane $lane): Response
    {
        return $this->allowBoardStructure($actor, $lane->board);
    }
}
