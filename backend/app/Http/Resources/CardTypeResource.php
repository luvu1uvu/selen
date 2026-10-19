<?php

namespace App\Http\Resources;

use App\Models\CardType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin CardType
 */
class CardTypeResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'is_default' => $this->is_default,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
        ];
    }
}
