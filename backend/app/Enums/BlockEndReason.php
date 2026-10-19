<?php

namespace App\Enums;

/**
 * Почему закончилась блокировка (card_blocks.end_reason, ADR-0011). Значения не переименовываем — они в истории.
 */
enum BlockEndReason: string
{
    /** Сняли вручную. */
    case Manual = 'manual';

    /** Блокирующая карточка вошла в «готово» — сняла CardPlacement. */
    case BlockerCompleted = 'blocker_completed';

    /** Блокирующую карточку удалили в корзину (ADR-0015) — сняла DeleteCardAction. */
    case BlockerDeleted = 'blocker_deleted';
}
