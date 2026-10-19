<?php

namespace App\Actions\Cards;

use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPeople;
use App\Services\Cards\CardVisibility;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Убрать участника карточки. Пользователь с ограничением «только свои карточки» не может убрать
 * сам себя, если после этого перестанет видеть карточку: это может сделать только другой
 * пользователь (ADR-0008, поправка PM B).
 */
class RemoveCardParticipantAction
{
    public function __construct(
        private readonly CardGuard $guard,
        private readonly CardPeople $people,
        private readonly CardVisibility $visibility,
    ) {}

    public function handle(User $actor, Card $card, User $user): Card
    {
        return DB::transaction(function () use ($actor, $card, $user) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            $losesAccess = $actor->is($user)
                && $this->visibility->isRestricted($actor, $card->space)
                && $card->customer_id !== $actor->id
                && $card->responsible_id !== $actor->id;

            if ($losesAccess) {
                throw ValidationException::withMessages(['user_id' => __('selen.cards.keep_access')]);
            }

            if (! $this->people->removeParticipant($card, $user, $actor)) {
                throw ValidationException::withMessages(['user_id' => __('selen.cards.not_participant')]);
            }

            return $card;
        });
    }
}
