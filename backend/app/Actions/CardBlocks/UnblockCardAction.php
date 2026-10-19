<?php

namespace App\Actions\CardBlocks;

use App\Actions\Cards\CardGuard;
use App\Enums\BlockEndReason;
use App\Enums\EventType;
use App\Models\CardBlock;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Снять блокировку вручную: эпизод закрывается, строка остаётся в истории (ADR-0011). */
class UnblockCardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, CardBlock $block): CardBlock
    {
        return DB::transaction(function () use ($actor, $block) {
            $block = CardBlock::query()->lockForUpdate()->findOrFail($block->id);
            $this->guard->ensureNotArchived($block->card);

            if (! $block->isActive()) {
                throw ValidationException::withMessages(['block' => __('selen.blocks.ended')]);
            }

            $block->forceFill([
                'ended_at' => Date::now(),
                'ended_by' => $actor->id,
                'end_reason' => BlockEndReason::Manual,
            ])->save();

            $this->events->record(EventType::CardUnblocked, $actor, $block->card, [
                'block_id' => $block->id,
                'blocking_card_id' => $block->blocking_card_id,
                'end_reason' => BlockEndReason::Manual->value,
            ]);

            return $block;
        });
    }
}
