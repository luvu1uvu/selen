<?php

namespace App\Actions\CardBlocks;

use App\Actions\CardRelations\RelatedCardGuard;
use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Заблокировать карточку (ADR-0011): причина — текст и/или блокирующая карточка. Одновременно может
 * действовать несколько блокировок. Блокировка по карточке снимется сама, когда та войдёт в «готово».
 */
class BlockCardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly RelatedCardGuard $related,
    ) {}

    /**
     * @param  bool  $byCard  запрошена блокирующая карточка (даже если её номер не нашёлся)
     */
    public function handle(User $actor, Card $card, ?string $reason, bool $byCard, ?Card $blocker): CardBlock
    {
        return DB::transaction(function () use ($actor, $card, $reason, $byCard, $blocker) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            $reason = $reason === null || trim($reason) === '' ? null : trim($reason);
            $blockerId = null;
            if ($byCard) {
                $blocker = $this->related->ensureRelatable($actor, $card, $blocker, 'blocking_card');
                if ($blocker->completed_at !== null) {
                    throw ValidationException::withMessages(['blocking_card' => __('selen.blocks.blocker_done')]);
                }
                if ($card->blocks()->active()->where('blocking_card_id', $blocker->id)->exists()) {
                    throw ValidationException::withMessages(['blocking_card' => __('selen.blocks.exists')]);
                }
                $blockerId = $blocker->id;
            } elseif ($reason === null) {
                throw ValidationException::withMessages(['reason' => __('selen.blocks.cause_required')]);
            }

            $block = new CardBlock;
            $block->forceFill([
                'card_id' => $card->id,
                'blocking_card_id' => $blockerId,
                'reason' => $reason,
                'started_at' => Date::now(),
                'started_by' => $actor->id,
            ])->save();

            // Текст причины может содержать что угодно — в журнал только факт его наличия
            $this->events->record(EventType::CardBlocked, $actor, $card, [
                'block_id' => $block->id,
                'blocking_card_id' => $block->blocking_card_id,
                'has_reason' => $reason !== null,
            ]);

            return $block;
        });
    }
}
