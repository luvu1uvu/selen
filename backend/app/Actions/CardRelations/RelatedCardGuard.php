<?php

namespace App\Actions\CardRelations;

use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use Illuminate\Validation\ValidationException;

/**
 * Проверка второй карточки связи или блокировки: того же пространства и видна пользователю
 * (режим «только свои карточки», ADR-0008). Чужая и невидимая карточка неотличимы от несуществующей.
 */
class RelatedCardGuard
{
    public function __construct(private readonly CardVisibility $visibility) {}

    /** Вызывать внутри транзакции: вторая карточка перечитывается под разделяемой блокировкой. */
    public function ensureRelatable(User $actor, Card $card, ?Card $other, string $field): Card
    {
        // Параллельное удаление в корзину (FOR UPDATE) дождётся новой блокировки и снимет её — или уже успело,
        // и карточки нет: блокировка удалённой карточкой не появится (ADR-0015)
        $other = $other === null ? null : Card::query()->sharedLock()->find($other->id);

        if ($other === null || $other->space_id !== $card->space_id || ! $this->visibility->canSee($actor, $other)) {
            throw ValidationException::withMessages([$field => __('selen.relations.card_not_found')]);
        }

        if ($other->id === $card->id) {
            throw ValidationException::withMessages([$field => __($field === 'blocking_card' ? 'selen.blocks.self' : 'selen.relations.self')]);
        }

        if ($other->isArchived()) {
            throw ValidationException::withMessages([$field => __($field === 'blocking_card' ? 'selen.blocks.blocker_archived' : 'selen.relations.archived')]);
        }

        return $other;
    }
}
