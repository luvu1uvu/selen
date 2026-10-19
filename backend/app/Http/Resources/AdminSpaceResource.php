<?php

namespace App\Http\Resources;

use App\Models\Space;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Пространство в админке системного администратора: только метаданные, без содержимого.
 *
 * @mixin Space
 */
class AdminSpaceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();

        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            // Иконка-эмодзи из дерева навигации (ADR-0013)
            'icon' => $this->whenLoaded('navNode', fn () => $this->navNode?->icon),
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            'admins' => $this->admins->map(fn ($member) => [
                'id' => $member->user->id,
                'name' => $member->user->name,
                'status' => $member->user->status,
            ])->values(),
            'members_count' => (int) $this->members_count,
            'groups_count' => (int) $this->getAttribute('group_grants_count'),
            // Инвариант: хотя бы один личный не деактивированный администратор (ADR-0012)
            'has_active_admin' => (bool) $this->getAttribute('has_active_admin'),
            // Своя роль администратора в этом пространстве (null — нет доступа к содержимому)
            'my_role' => $this->roleOf($user),
        ];
    }
}
