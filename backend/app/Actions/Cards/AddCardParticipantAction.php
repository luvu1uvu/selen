<?php

namespace App\Actions\Cards;

use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPeople;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Добавить участника карточки. Кого можно назначать, проверяет Form Request (AssignableMember). */
class AddCardParticipantAction
{
    public function __construct(
        private readonly CardGuard $guard,
        private readonly CardPeople $people,
    ) {}

    public function handle(User $actor, Card $card, User $user): Card
    {
        return DB::transaction(function () use ($actor, $card, $user) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            if (! $this->people->addParticipant($card, $user, $actor)) {
                throw ValidationException::withMessages(['user_id' => __('selen.cards.already_participant')]);
            }

            return $card;
        });
    }
}
