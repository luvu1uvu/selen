<?php

namespace App\Http\Resources;

use App\Models\CardTransition;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Переход карточки для истории в панели. Категории — снимок на момент перемещения;
 * названия колонок и досок — текущие (подписи к сохранённым id).
 *
 * @mixin CardTransition
 */
class CardTransitionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'moved_at' => $this->moved_at->format('Y-m-d\TH:i:s.u\Z'),
            'reason' => $this->reason,
            'actor' => $this->actor === null ? null : ['id' => $this->actor->id, 'name' => $this->actor->name],
            'from_board' => $this->fromBoard === null ? null : ['id' => $this->fromBoard->id, 'name' => $this->fromBoard->name],
            'to_board' => ['id' => $this->toBoard->id, 'name' => $this->toBoard->name],
            'from_column' => $this->fromColumn === null ? null : ['id' => $this->fromColumn->id, 'name' => $this->fromColumn->name],
            'to_column' => ['id' => $this->toColumn->id, 'name' => $this->toColumn->name],
            'from_lane' => $this->fromLane === null ? null : ['id' => $this->fromLane->id, 'name' => $this->fromLane->name],
            'to_lane' => ['id' => $this->toLane->id, 'name' => $this->toLane->name],
            'from_category' => $this->from_category,
            'to_category' => $this->to_category,
        ];
    }
}
