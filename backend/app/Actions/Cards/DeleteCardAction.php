<?php

namespace App\Actions\Cards;

use App\Enums\BlockEndReason;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Удаление карточки в корзину — активной или архивной (LATER-45, ADR-0015). Право — только у системного
 * администратора (CardPolicy::delete). Мягкое: история, содержимое и вложения остаются, карточка пропадает
 * из всех выборок; вернуть — RestoreCardFromTrashAction. Блокировки, где она блокирующая, снимаются.
 */
class DeleteCardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardPlacement $placement,
    ) {}

    public function handle(User $actor, Card $card): void
    {
        DB::transaction(function () use ($actor, $card) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $now = Date::now();

            $card->forceFill(['deleted_at' => $now, 'deleted_by' => $actor->id])->save();
            $this->events->record(EventType::CardDeleted, $actor, $card, [], $now);

            $this->placement->releaseBlocksBy($card, BlockEndReason::BlockerDeleted, $actor, $now);
        });
    }
}
