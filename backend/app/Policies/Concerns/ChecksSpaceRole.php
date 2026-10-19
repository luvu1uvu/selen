<?php

namespace App\Policies\Concerns;

use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\Card;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\SpaceAccess;
use App\Services\Cards\CardVisibility;
use Illuminate\Auth\Access\Response;

/**
 * Единые правила доступа к содержимому пространства (docs/adr/0005-space-access.md):
 *
 * - не участник получает 404 — существование чужого ресурса не раскрываем;
 * - участник без нужной роли получает 403;
 * - архивное пространство доступно участникам только для чтения;
 * - карточка, которую пользователь не видит (режим «только свои карточки», ADR-0008), — 404.
 *
 * Права берутся только из Space::accessOf() — итоговых прав по всем источникам (личное участие и группы,
 * ADR-0012): действие разрешено, если его целиком разрешает хотя бы один источник.
 * Системная роль admin здесь намеренно не учитывается.
 */
trait ChecksSpaceRole
{
    protected function allowMember(User $actor, Space $space): Response
    {
        return $space->accessOf($actor)->isMember() ? Response::allow() : Response::denyAsNotFound();
    }

    /**
     * @param  callable(SpaceRole): bool  $permits
     */
    protected function allowRole(User $actor, Space $space, callable $permits): Response
    {
        return $this->decide($actor, $space, fn (SpaceAccess $access) => $access->allows($permits));
    }

    protected function allowSpaceAdmin(User $actor, Space $space): Response
    {
        return $this->allowRole($actor, $space, fn (SpaceRole $role) => $role->canManageSpace());
    }

    /**
     * Изменения на доске: как allowRole, плюс архивная доска — только для чтения.
     *
     * @param  callable(SpaceRole): bool  $permits
     */
    protected function allowOnBoard(User $actor, Board $board, callable $permits): Response
    {
        return $this->onBoard($board, $this->allowRole($actor, $board->space, $permits));
    }

    protected function allowBoardStructure(User $actor, Board $board): Response
    {
        return $this->allowOnBoard($actor, $board, fn (SpaceRole $role) => $role->canManageSpace());
    }

    protected function allowCardEditing(User $actor, Board $board): Response
    {
        return $this->allowOnBoard($actor, $board, fn (SpaceRole $role) => $role->canEditCards());
    }

    /**
     * Действие с карточкой и всем, что в ней (комментарии, файлы, чек-листы...).
     * Сначала видимость: невидимая карточка не существует (404) для любой роли. Затем роль:
     * без $permits — достаточно видеть карточку, иначе — источник, который разрешает роль и (без ограничения
     * или карточка «своя»), плюс правила архива пространства и доски.
     *
     * @param  (callable(SpaceRole): bool)|null  $permits
     */
    protected function allowCard(User $actor, Card $card, ?callable $permits = null): Response
    {
        if (! app(CardVisibility::class)->canSee($actor, $card)) {
            return Response::denyAsNotFound();
        }

        if ($permits === null) {
            return Response::allow();
        }

        $response = $this->decide(
            $actor,
            $card->space,
            fn (SpaceAccess $access) => $access->allowsOnCard($permits, fn () => $card->involves($actor)),
        );

        return $this->onBoard($card->board, $response);
    }

    /**
     * Общий порядок проверок: нет доступа — 404, архивное пространство — 403 с текстом, затем права.
     *
     * @param  callable(SpaceAccess): bool  $permits
     */
    private function decide(User $actor, Space $space, callable $permits): Response
    {
        $access = $space->accessOf($actor);

        if (! $access->isMember()) {
            return Response::denyAsNotFound();
        }

        if ($space->isArchived()) {
            return Response::deny(__('selen.spaces.archived'));
        }

        return $permits($access) ? Response::allow() : Response::deny();
    }

    private function onBoard(Board $board, Response $response): Response
    {
        if ($response->allowed() && $board->isArchived()) {
            return Response::deny(__('selen.boards.archived'));
        }

        return $response;
    }
}
