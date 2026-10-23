<?php

namespace App\Http\Resources;

use App\Enums\Permission;
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
        $access = $this->accessOf($user);
        $writable = ! $this->isArchived();

        return [
            'id' => $this->id,
            'key' => $this->key,
            'name' => $this->name,
            // Компания пространства (только id, ADR-0024): справочники людей и групп для выдачи доступа — по ней
            'company_id' => $this->company_id,
            'description' => $this->description,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'my_role' => $access->highestRole(),
            'permissions' => [
                // Прежний составной флаг администратора пространства (доски, метки, участники); на права каталога
                // по отдельности интерфейс перейдёт с пользовательскими ролями (П2e)
                'manage' => $writable && $access->allows(Permission::SpaceUpdate),
                'edit_cards' => $writable && $access->allows(Permission::CardUpdate),
                // Источники доступа (вкладка «Группы»): не показываются при «только своих карточках» во всех источниках
                'view_access_sources' => Gate::forUser($user)->allows('viewAccessSources', $this->resource),
            ],
            // Активные доски — для сайдбара (загружаются явно)
            'boards' => BoardResource::collection($this->whenLoaded('boards')),
        ];
    }
}
