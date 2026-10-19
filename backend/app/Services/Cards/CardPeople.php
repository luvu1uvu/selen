<?php

namespace App\Services\Cards;

use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Участники карточки и правила, которые меняют состав людей без явной команды пользователя:
 * автоназначение при переходе в работу и «не потерять доступ» в режиме «только свои карточки».
 *
 * Вызывать внутри транзакции, в которой меняется карточка (строка карточки заблокирована).
 */
class CardPeople
{
    public const VIA_AUTO_ASSIGN = 'auto_assign';

    public const VIA_KEEP_ACCESS = 'keep_access';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardVisibility $visibility,
    ) {}

    /** Добавить участника. false — он уже участник. */
    public function addParticipant(Card $card, User $user, User $actor, ?string $via = null): bool
    {
        $inserted = DB::table('card_participants')->insertOrIgnore([
            'card_id' => $card->id,
            'user_id' => $user->id,
            'added_by' => $actor->id,
            'created_at' => Date::now(),
        ]);

        if ($inserted === 0) {
            return false;
        }

        $card->unsetRelation('participants');
        $this->events->record(EventType::CardParticipantAdded, $actor, $card, array_filter([
            'user_id' => $user->id,
            'via' => $via,
        ]));

        return true;
    }

    /** Убрать участника. false — он не был участником. */
    public function removeParticipant(Card $card, User $user, User $actor): bool
    {
        $deleted = DB::table('card_participants')->where('card_id', $card->id)->where('user_id', $user->id)->delete();

        if ($deleted === 0) {
            return false;
        }

        $card->unsetRelation('participants');
        $this->events->record(EventType::CardParticipantRemoved, $actor, $card, ['user_id' => $user->id]);

        return true;
    }

    /**
     * Пользователь с ограничением «только свои карточки», который своим действием перестал бы видеть
     * карточку (сменил заказчика или ответственного), остаётся её участником (ADR-0008, поправка PM B).
     */
    public function keepAccess(Card $card, User $actor): void
    {
        if ($this->visibility->isRestricted($actor, $card->space) && ! $card->involves($actor)) {
            $this->addParticipant($card, $actor, $actor, self::VIA_KEEP_ACCESS);
        }
    }

    /**
     * Автоназначение при ручном переходе карточки в «в работе» или «готово» (как в Kaiten):
     * если ответственного нет — переместивший становится ответственным, иначе — участником.
     */
    public function autoAssign(Card $card, User $actor): void
    {
        if ($card->responsible_id === null) {
            $card->forceFill(['responsible_id' => $actor->id])->save();
            $this->events->record(EventType::CardUpdated, $actor, $card, [
                'fields' => ['responsible_id'],
                'changes' => ['responsible_id' => ['from' => null, 'to' => $actor->id]],
                'via' => self::VIA_AUTO_ASSIGN,
            ]);

            return;
        }

        if ($card->responsible_id !== $actor->id) {
            $this->addParticipant($card, $actor, $actor, self::VIA_AUTO_ASSIGN);
        }
    }
}
