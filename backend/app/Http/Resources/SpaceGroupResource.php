<?php

namespace App\Http\Resources;

use App\Models\SpaceGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Доступ группы к пространству — вкладка «Группы» в участниках пространства.
 * Архивная группа остаётся в списке с пометкой: доступа она не даёт, но доступ сохранён.
 *
 * @mixin SpaceGroup
 */
class SpaceGroupResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'group' => [
                'id' => $this->group->id,
                'name' => $this->group->name,
                'description' => $this->group->description,
                'system' => $this->group->system_key,
                'archived_at' => $this->group->archived_at?->toIso8601ZuluString(),
                'members_count' => $this->group->membersCount(),
            ],
            'role' => $this->role,
            'own_cards_only' => $this->own_cards_only,
            'added_at' => $this->created_at->toIso8601ZuluString(),
        ];
    }
}
