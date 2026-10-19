<?php

namespace App\Policies;

use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Карточки: смотрят все участники, меняют и перемещают editor и admin пространства. В корзину удаляет и из неё
 * возвращает только системный администратор (LATER-45, ADR-0015); карточка в корзине — 404 для всех (CardVisibility).
 * В режиме «только свои карточки» чужая карточка не существует — 404 (ADR-0008).
 */
class CardPolicy
{
    use ChecksSpaceRole;

    public function view(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card);
    }

    /** Комментировать и прикладывать файлы — любая роль, включая commenter (решение PM). */
    public function comment(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, fn (SpaceRole $role) => true);
    }

    /** Поля, люди, метки, чек-листы, ссылки, перемещение, архив. */
    public function update(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, fn (SpaceRole $role) => $role->canEditCards());
    }

    /**
     * Удалить в корзину — только системный администратор (решение PM), и только там, где он видит карточку
     * и может что-то менять: невидимая — 404, архивное пространство или доска — 403. Роль в пространстве — любая.
     */
    public function delete(User $actor, Card $card): Response
    {
        $response = $this->allowCard($actor, $card, fn (SpaceRole $role) => true);

        return $response->allowed() && ! $actor->isAdmin() ? Response::deny() : $response;
    }

    /** «Администрирование → Корзина»: список удалённых карточек всех пространств. */
    public function viewTrash(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function restoreFromTrash(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
