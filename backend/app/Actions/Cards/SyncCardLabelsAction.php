<?php

namespace App\Actions\Cards;

use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Метки карточки целиком (PUT). Какие метки допустимы (общие и этого пространства, новые — только активные),
 * проверяет Form Request. В журнал — одно событие с добавленными и снятыми метками.
 */
class SyncCardLabelsAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    /**
     * @param  list<string>  $labelIds
     */
    public function handle(User $actor, Card $card, array $labelIds): Card
    {
        return DB::transaction(function () use ($actor, $card, $labelIds) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            $changes = $card->labels()->sync(array_values(array_unique($labelIds)));
            $added = $changes['attached'];
            $removed = $changes['detached'];

            if ($added !== [] || $removed !== []) {
                sort($added);
                sort($removed);
                $this->events->record(EventType::CardLabelsChanged, $actor, $card, [
                    'added' => $added,
                    'removed' => $removed,
                ]);
            }

            return $card;
        });
    }
}
