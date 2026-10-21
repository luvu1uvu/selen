<?php

namespace App\Http\Resources;

use App\Models\Board;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Доска в списках (страница пространства, сайдбар). row_id и position — место в раскладке пространства: ряд и порядок
 * внутри ряда (ADR-0019). Только в списке досок пространства (BoardController::index): число листовых колонок (ширина
 * доски без загрузки карточек), счётчик видимых пользователю активных карточек и личный признак сворачивания.
 *
 * @mixin Board
 */
class BoardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'space_id' => $this->space_id,
            'name' => $this->name,
            'description' => $this->description,
            'row_id' => $this->row_id,
            'position' => $this->position,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'leaf_columns_count' => $this->whenHas('leaf_columns_count'),
            'cards_count' => $this->whenHas('cards_count'),
            'collapsed' => $this->whenHas('collapsed'),
        ];
    }
}
