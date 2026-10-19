<?php

namespace App\Http\Resources;

use App\Models\Board;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Доска в списках (страница пространства, сайдбар).
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
            'position' => $this->position,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
        ];
    }
}
