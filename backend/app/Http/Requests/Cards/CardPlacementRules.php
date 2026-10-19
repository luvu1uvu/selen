<?php

namespace App\Http\Requests\Cards;

use Illuminate\Validation\Rule;

/** Целевая ячейка карточки: активные колонка и дорожка указанной доски. */
trait CardPlacementRules
{
    /**
     * @return array<string, mixed>
     */
    protected function cellRules(string $boardId): array
    {
        return [
            'column_id' => [
                'required', 'ulid',
                Rule::exists('board_columns', 'id')->where('board_id', $boardId)->whereNull('archived_at'),
            ],
            'lane_id' => [
                'required', 'ulid',
                Rule::exists('lanes', 'id')->where('board_id', $boardId)->whereNull('archived_at'),
            ],
            'after_id' => ['nullable', 'ulid'],
            'before_id' => ['nullable', 'ulid'],
        ];
    }
}
