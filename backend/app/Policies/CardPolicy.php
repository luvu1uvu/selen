<?php

namespace App\Policies;

use App\Enums\Permission;
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

    /** Комментировать и прикладывать файлы — любая стандартная роль, включая «Комментатора» (решение PM). */
    public function comment(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, Permission::CardComment);
    }

    /** Поля, заказчик и ответственный, метки, чек-листы, ссылки, связи, блокировки. */
    public function update(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, Permission::CardUpdate);
    }

    /** Перемещение по колонкам и доскам, архив и возврат из архива. */
    public function move(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, Permission::CardMove);
    }

    /** Добавить или убрать участника карточки. */
    public function invite(User $actor, Card $card): Response
    {
        return $this->allowCard($actor, $card, Permission::CardInvite);
    }

    /**
     * Удалить в корзину — до П2d только системный администратор (решение PM; с П2d — право «удаление в корзину»
     * роли), и только там, где он видит карточку и может что-то менять: невидимая — 404, архивное пространство
     * или доска — 403. Роль в пространстве — любая (чтение есть в любой роли).
     */
    public function delete(User $actor, Card $card): Response
    {
        $response = $this->allowCard($actor, $card, Permission::SpaceRead);

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
