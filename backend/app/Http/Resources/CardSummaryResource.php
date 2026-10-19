<?php

namespace App\Http\Resources;

use App\Models\Card;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Карточка в списках поиска и архива: номер, название, где лежит. Ожидает загруженные space, board,
 * column.parent. Попадают сюда только видимые пользователю карточки (CardVisibility::scope).
 *
 * @mixin Card
 */
class CardSummaryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key(),
            'title' => $this->title,
            'board' => ['id' => $this->board->id, 'name' => $this->board->name],
            'column' => [
                'name' => $this->column->parent ? $this->column->parent->name.' / '.$this->column->name : $this->column->name,
                'category' => $this->column->effectiveCategory(),
            ],
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
        ];
    }
}
