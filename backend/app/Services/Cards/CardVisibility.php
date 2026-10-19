<?php

namespace App\Services\Cards;

use App\Enums\ColumnCategory;
use App\Models\Card;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Единственная точка правила «кто видит карточку» (docs/adr/0008-own-cards-only.md).
 *
 * Участник пространства видит все его карточки. Исключение — режим «только свои карточки»: если ВСЕ
 * источники доступа пользователя (личное участие и группы, ADR-0012) с ограничением, видны только карточки,
 * где он заказчик, ответственный или участник. Остальные для него не существуют (404), а в связях
 * показываются как «Скрытая карточка». Права читаются только через Space::accessOf().
 *
 * Любая выборка карточек для пользователя (доска, поиск, архив, связи) проходит через scope(),
 * любая проверка одной карточки — через canSee().
 *
 * Корзина (ADR-0015): удалённую карточку не видит никто, включая системного администратора (404 как для чужой;
 * вернуть её можно только в «Администрирование → Корзина»). Выборки её и так не содержат (SoftDeletes у Card),
 * а там, где она загружена через связь (withTrashed), — canSee() = false, в связях и истории — «Удалённая
 * карточка» без номера и названия.
 */
class CardVisibility
{
    /** Действует ли для пользователя в пространстве режим «только свои карточки». */
    public function isRestricted(User $user, Space $space): bool
    {
        return $space->accessOf($user)->isRestricted();
    }

    /** Видит ли пользователь карточку: есть доступ и (источник без ограничения или карточка «своя»). */
    public function canSee(User $user, Card $card): bool
    {
        return ! $card->trashed() && $this->wouldSee($user, $card);
    }

    /**
     * Видел бы карточку, не будь она в корзине: доступ и (источник без ограничения или карточка «своя»).
     * Для «Корзины» (название — только тому, кто видел бы карточку, ADR-0015) — participants лучше загрузить заранее.
     */
    public function wouldSee(User $user, Card $card): bool
    {
        $access = $card->space->accessOf($user);

        if (! $access->isMember()) {
            return false;
        }

        return $access->canSeeAllCards() || $card->involves($user);
    }

    /**
     * Связанная карточка (связь, блокировка, история) глазами пользователя: номер, название, категория —
     * или только {hidden: true} («Скрытая карточка» без номера и названия), если он её не видит;
     * удалённая в корзину — {hidden: true, deleted: true} («Удалённая карточка»), но только тому, кто видел бы её.
     * Ожидает загруженные column.parent и participants (иначе догрузит).
     *
     * @return array{hidden: true, deleted?: true}|array{hidden: false, id: string, key: string, title: string, category: ColumnCategory, archived: bool}
     */
    public function present(User $user, Card $card): array
    {
        // Кто не видел бы карточку, тот не узнаёт и об удалении: для него она по-прежнему «Скрытая»
        if (! $this->wouldSee($user, $card)) {
            return ['hidden' => true];
        }

        if ($card->trashed()) {
            return ['hidden' => true, 'deleted' => true];
        }

        return [
            'hidden' => false,
            'id' => $card->id,
            'key' => $card->key(),
            'title' => $card->title,
            'category' => $card->column->effectiveCategory(),
            'archived' => $card->isArchived(),
        ];
    }

    /**
     * Ограничить выборку карточек пространства теми, что видит пользователь.
     * Принадлежность к пространству (участник ли он) проверяют политики до выборки.
     *
     * @template TQuery of Builder<Card>
     *
     * @param  TQuery  $query
     * @return TQuery
     */
    public function scope(Builder $query, User $user, Space $space): Builder
    {
        if ($this->isRestricted($user, $space)) {
            $query->involving($user);
        }

        return $query;
    }
}
