<?php

namespace App\Http\Resources;

use App\Models\AccessGrant;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Доступ группы к пространству (выдача группе) — вкладка «Группы» в участниках пространства.
 * Архивная группа остаётся в списке с пометкой: доступа она не даёт, но доступ сохранён.
 * Роль — в прежнем виде API: роль + «только свои карточки» (ADR-0024, П2a). Ожидает загруженные group и role.
 *
 * @mixin AccessGrant
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
            'role' => $this->legacyRole(),
            'own_cards_only' => $this->ownCardsOnly(),
            'added_at' => $this->created_at->toIso8601ZuluString(),
        ];
    }
}
