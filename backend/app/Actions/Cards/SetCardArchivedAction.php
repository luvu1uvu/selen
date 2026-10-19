<?php

namespace App\Actions\Cards;

use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация карточки вместо удаления. Архивация — не переход: положение не меняется.
 *
 * Восстановление возвращает карточку в конец её ячейки. Если колонку или дорожку тем временем
 * архивировали (или колонку разбили на подколонки) — в первую листовую колонку и первую дорожку доски;
 * это перемещение пишется переходом.
 */
class SetCardArchivedAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardPlacement $placement,
    ) {}

    public function handle(User $actor, Card $card, bool $archived): Card
    {
        return DB::transaction(function () use ($actor, $card, $archived) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);

            if ($card->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'card' => __($archived ? 'selen.cards.archived' : 'selen.cards.not_archived'),
                ]);
            }

            if ($archived) {
                $card->forceFill(['archived_at' => Date::now()])->save();
                $this->events->record(EventType::CardArchived, $actor, $card);

                return $card;
            }

            $card->forceFill(['archived_at' => null]);
            $this->placement->returnToBoard($card, $actor);

            $this->events->record(EventType::CardRestored, $actor, $card);

            return $card;
        });
    }
}
