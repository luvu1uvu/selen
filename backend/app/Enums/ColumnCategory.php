<?php

namespace App\Enums;

/**
 * Тип колонки первого уровня (как в Kaiten). Определяет статус карточки и метрики потока
 * (docs/adr/0006-card-transitions.md). Подколонки наследуют тип родителя.
 */
enum ColumnCategory: string
{
    case Queue = 'queue';
    case InProgress = 'in_progress';
    case Done = 'done';

    /** Вход в эту категорию означает, что работа над карточкой началась. */
    public function isStarted(): bool
    {
        return $this === self::InProgress || $this === self::Done;
    }
}
