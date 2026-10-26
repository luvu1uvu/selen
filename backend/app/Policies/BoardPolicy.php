<?php

namespace App\Policies;

use App\Enums\Permission;
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
        return $this->allowPermission($actor, $space, Permission::BoardCreate);
    }

    /** Название, описание, порядок, колонки и дорожки. */
    public function manage(User $actor, Board $board): Response
    {
        return $this->allowOnBoard($actor, $board, Permission::BoardUpdate);
    }

    /** Отправить доску в архив (ADR-0024: «удаление» доски — архив и восстановление). */
    public function archive(User $actor, Board $board): Response
    {
        return $this->allowOnBoard($actor, $board, Permission::BoardDelete);
    }

    /** Восстановить архивную доску (в активном пространстве). */
    public function restore(User $actor, Board $board): Response
    {
        return $this->allowPermission($actor, $board->space, Permission::BoardDelete);
    }

    /** Список архивных карточек доски (восстановление — CardPolicy::move): архив и возврат — перемещение карточек. */
    public function viewArchive(User $actor, Board $board): Response
    {
        return $this->allowPermission($actor, $board->space, Permission::CardMove);
    }

    public function createCard(User $actor, Board $board): Response
    {
        return $this->allowOnBoard($actor, $board, Permission::CardCreate);
    }

    /**
     * Удалять карточки доски в корзину — как CardPolicy::delete: до П2d — право компании «корзина» с любой ролью
     * в пространстве (чтение есть в любой роли), доска и пространство не в архиве.
     */
    public function deleteCards(User $actor, Board $board): Response
    {
        $response = $this->allowOnBoard($actor, $board, Permission::SpaceRead);

        return $response->allowed() && ! $board->space->company->permissionsOf($actor)->allows(Permission::CompanyManageTrash)
            ? Response::deny()
            : $response;
    }
}
