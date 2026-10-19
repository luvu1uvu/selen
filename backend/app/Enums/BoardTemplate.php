<?php

namespace App\Enums;

/**
 * Шаблоны новой доски. После создания колонки свободно редактируются.
 */
enum BoardTemplate: string
{
    case Simple = 'simple';
    case Development = 'development';
    case Empty = 'empty';

    /**
     * Колонки первого уровня по порядку: [название, тип].
     *
     * @return list<array{string, ColumnCategory}>
     */
    public function columns(): array
    {
        return match ($this) {
            self::Simple => [
                ['To Do', ColumnCategory::Queue],
                ['In Progress', ColumnCategory::InProgress],
                ['Review', ColumnCategory::InProgress],
                ['Done', ColumnCategory::Done],
            ],
            self::Development => [
                ['Backlog', ColumnCategory::Queue],
                ['To Do', ColumnCategory::Queue],
                ['In Progress', ColumnCategory::InProgress],
                ['Code Review', ColumnCategory::InProgress],
                ['Ready for Testing', ColumnCategory::InProgress],
                ['Testing', ColumnCategory::InProgress],
                ['Ready for Merge', ColumnCategory::InProgress],
                ['Done', ColumnCategory::Done],
            ],
            self::Empty => [],
        };
    }
}
