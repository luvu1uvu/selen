<?php

namespace App\Actions\Cards;

use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Вернуть карточку из корзины (ADR-0015) туда, откуда её удалили: архивная — в архив, активная — на доску
 * по правилам восстановления из архива (CardPlacement::returnToBoard). Только системный администратор.
 * Из архивного пространства или с архивной доски не возвращается — сначала восстанавливают их (422).
 * Снятые при удалении блокировки других карточек не возвращаются — это закрытые эпизоды истории.
 */
class RestoreCardFromTrashAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardPlacement $placement,
    ) {}

    public function handle(User $actor, Card $card): Card
    {
        return DB::transaction(function () use ($actor, $card) {
            $card = Card::onlyTrashed()->lockForUpdate()->findOrFail($card->id);

            // Архивные пространство и доска — только для чтения: сначала их восстанавливают
            if ($card->space->isArchived()) {
                throw ValidationException::withMessages(['card' => __('selen.cards.trash_space_archived', ['space' => $card->space->name])]);
            }
            if ($card->board->isArchived()) {
                throw ValidationException::withMessages(['card' => __('selen.cards.trash_board_archived', ['board' => $card->board->name])]);
            }

            $card->forceFill(['deleted_at' => null, 'deleted_by' => null]);
            if ($card->isArchived()) {
                $card->save();
            } else {
                $this->placement->returnToBoard($card, $actor);
            }

            $this->events->record(EventType::CardRestoredFromTrash, $actor, $card);

            return $card;
        });
    }
}
