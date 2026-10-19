<?php

namespace App\Policies;

use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\Space;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Доски: смотрят все участники пространства, структуру меняет администратор пространства,
 * карточки создаёт editor и выше. Не участник — 404 (ADR-0005).
 */
class BoardPolicy
{
    use ChecksSpaceRole;

    public function view(User $actor, Board $board): Response
    {
        return $this->allowMember($actor, $board->space);
    }

    /** Создать доску в пространстве. */
    public function create(User $actor, Space $space): Response
    {
        return $this->allowSpaceAdmin($actor, $space);
    }

    /** Название, порядок, архив, колонки и дорожки. */
    public function manage(User $actor, Board $board): Response
    {
        return $this->allowBoardStructure($actor, $board);
    }

    /** Восстановить архивную доску (в активном пространстве). */
    public function restore(User $actor, Board $board): Response
    {
        return $this->allowSpaceAdmin($actor, $board->space);
    }

    /** Список архивных карточек доски (восстановление — CardPolicy::update): editor и admin. */
    public function viewArchive(User $actor, Board $board): Response
    {
        return $this->allowRole($actor, $board->space, fn (SpaceRole $role) => $role->canEditCards());
    }

    public function createCard(User $actor, Board $board): Response
    {
        return $this->allowCardEditing($actor, $board);
    }

    /** Удалять карточки доски в корзину — как CardPolicy::delete: системный администратор, доска и пространство не в архиве. */
    public function deleteCards(User $actor, Board $board): Response
    {
        $response = $this->allowOnBoard($actor, $board, fn (SpaceRole $role) => true);

        return $response->allowed() && ! $actor->isAdmin() ? Response::deny() : $response;
    }
}
