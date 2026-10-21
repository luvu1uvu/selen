<?php

namespace App\Services\Metrics;

use App\Enums\ColumnCategory;
use App\Enums\TransitionReason;
use App\Models\Card;
use App\Models\CardTransition;

/**
 * Lead time и cycle time карточки — только из истории card_transitions (источник истины).
 * Текущие названия и типы колонок не используются: в переходах хранится снимок категории
 * на момент перемещения, поэтому переименование и смена типа колонки историю не меняют.
 *
 * Определения — docs/adr/0006-card-transitions.md:
 * - created_at — момент перехода «created»;
 * - first_started_at — первый вход в категорию in_progress (или сразу в done, если in_progress пропущена);
 * - completed_at — последний вход в done, если карточка сейчас в done; иначе null;
 * - lead time = created_at → completed_at; cycle time = first_started_at → completed_at.
 *
 * moved_at — последний переход в другое место (колонка, дорожка, доска; в том числе возврат из архива в другую ячейку
 * и переезд в первую подколонку). Смена типа колонки место не меняет — не перемещение (окно карточки, «Перемещена N
 * назад»).
 */
class CardFlowMetrics
{
    public function forCard(Card $card): CardFlowTimes
    {
        $transitions = CardTransition::query()
            ->where('card_id', $card->id)
            ->orderBy('moved_at')
            ->orderBy('id')
            ->get(['moved_at', 'from_category', 'to_category', 'reason']);

        $createdAt = null;
        $firstStartedAt = null;
        $completedAt = null;
        $movedAt = null;

        foreach ($transitions as $transition) {
            if ($transition->reason === TransitionReason::Created) {
                $createdAt = $transition->moved_at;
            }

            if ($firstStartedAt === null && $transition->to_category->isStarted()) {
                $firstStartedAt = $transition->moved_at;
            }

            if ($transition->reason === TransitionReason::Manual || $transition->reason === TransitionReason::ColumnSplit) {
                $movedAt = $transition->moved_at;
            }

            if ($transition->to_category !== ColumnCategory::Done) {
                $completedAt = null;
            } elseif ($transition->from_category !== ColumnCategory::Done) {
                $completedAt = $transition->moved_at;
            }
        }

        return new CardFlowTimes($createdAt, $firstStartedAt, $completedAt, $movedAt);
    }
}
