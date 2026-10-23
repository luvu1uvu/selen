<?php

namespace App\Policies\Concerns;

use App\Enums\Permission;
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
 * Права берутся только из Space::accessOf() — итоговых прав по всем источникам (личные выдачи и группы,
 * ADR-0012): действие разрешено, если его целиком разрешает хотя бы один источник. Проверяются права каталога
 * (App\Enums\Permission, ADR-0024), а не названия ролей. Системная роль admin здесь намеренно не учитывается.
 */
trait ChecksSpaceRole
{
    protected function allowMember(User $actor, Space $space): Response
    {
        return $space->accessOf($actor)->isMember() ? Response::allow() : Response::denyAsNotFound();
    }

    /** Действие в пространстве без конкретной карточки: нужное право хотя бы у одного источника. */
    protected function allowPermission(User $actor, Space $space, Permission $permission): Response
    {
        return $this->decide($actor, $space, fn (SpaceAccess $access) => $access->allows($permission));
    }

    /** Изменения на доске: как allowPermission, плюс архивная доска — только для чтения. */
    protected function allowOnBoard(User $actor, Board $board, Permission $permission): Response
    {
        return $this->onBoard($board, $this->allowPermission($actor, $board->space, $permission));
    }

    /**
     * Действие с карточкой и всем, что в ней (комментарии, файлы, чек-листы...).
     * Сначала видимость: невидимая карточка не существует (404) для любой роли. Затем право:
     * без $permission — достаточно видеть карточку, иначе — источник, у роли которого есть право и (область
     * «все карточки» или карточка «своя»), плюс правила архива пространства и доски.
     */
    protected function allowCard(User $actor, Card $card, ?Permission $permission = null): Response
    {
        if (! app(CardVisibility::class)->canSee($actor, $card)) {
            return Response::denyAsNotFound();
        }

        if ($permission === null) {
            return Response::allow();
        }

        $response = $this->decide(
            $actor,
            $card->space,
            fn (SpaceAccess $access) => $access->allowsOnCard($permission, fn () => $card->involves($actor)),
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
