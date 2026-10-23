<?php

namespace App\Http\Resources;

use App\Models\Space;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Пространство в админке системного администратора: только метаданные, без содержимого.
 * Администраторы (admins), счётчики и has_active_admin готовит Admin\SpaceController (через AccessResolver).
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
        /** @var Collection<int, User> $admins */
        $admins = $this->getRelation('admins');

        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            // Иконка-эмодзи из дерева навигации (ADR-0013)
            'icon' => $this->whenLoaded('navNode', fn () => $this->navNode?->icon),
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            // Личные администраторы пространства — личные выдачи с правом «управление доступом» (ADR-0012, ADR-0024)
            'admins' => $admins->map(fn (User $admin) => [
                'id' => $admin->id,
                'name' => $admin->name,
                'status' => $admin->status,
            ])->values(),
            'members_count' => (int) $this->getAttribute('personal_grants_count'),
            'groups_count' => (int) $this->getAttribute('group_grants_count'),
            // Инвариант: хотя бы один личный не деактивированный администратор (ADR-0012)
            'has_active_admin' => (bool) $this->getAttribute('has_active_admin'),
            // Своя роль администратора в этом пространстве (null — нет доступа к содержимому)
            'my_role' => $this->roleOf($user),
        ];
    }
}
