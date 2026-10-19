<?php

namespace App\Http\Resources;

use App\Models\Space;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * Пространство глазами участника: с его ролью и правами (права — подсказка для интерфейса,
 * реальную проверку делают политики).
 *
 * @mixin Space
 */
class SpaceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();
        $role = $this->roleOf($user);
        $writable = ! $this->isArchived();

        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'my_role' => $role,
            'permissions' => [
                'manage' => $writable && (bool) $role?->canManageSpace(),
                'edit_cards' => $writable && (bool) $role?->canEditCards(),
                // Источники доступа (вкладка «Группы»): не показываются при «только своих карточках» во всех источниках
                'view_access_sources' => Gate::forUser($user)->allows('viewAccessSources', $this->resource),
            ],
            // Активные доски — для сайдбара (загружаются явно)
            'boards' => BoardResource::collection($this->whenLoaded('boards')),
        ];
    }
}
