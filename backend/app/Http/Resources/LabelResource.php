<?php

namespace App\Http\Resources;

use App\Models\Label;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Label
 */
class LabelResource extends JsonResource
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
            // company — общая метка компании, space — метка пространства
            'scope' => $this->isCompanyWide() ? 'company' : 'space',
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
        ];
    }
}
