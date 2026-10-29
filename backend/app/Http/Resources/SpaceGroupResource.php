<?php

namespace App\Http\Resources;

use App\Actions\Access\NodeGrants;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Доступ группы к пространству — вкладка «Группы» в участниках пространства: выдачи группе на само пространство или на
 * папку над ним (`inherited_from` — папка, где он меняется; П2d-1), со всеми ролями группы на этом узле. Архивная группа
 * остаётся в списке с пометкой: доступа она не даёт, но доступ сохранён. Ожидает загруженные group, role и navNode.
 *
 * @property array{grants: Collection<int, AccessGrant>, space_node_id: string, company_id: string} $resource
 */
class SpaceGroupResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AccessGrant $first */
        $first = $this->resource['grants']->first();
        /** @var Group $group */
        $group = $first->group;
        // Гость — человек другой компании: группы компании-хозяина — без названий, описаний, пометки встроенной и
        // численности (решение PM 28.10 по аудиту П2c-1, LATER-139)
        $guestViewer = CompanyMembers::viewsAsGuest($request->user(), $this->resource['company_id']);
        $inherited = $first->nav_node_id !== $this->resource['space_node_id'];

        return [
            'group' => [
                'id' => $group->id,
                'name' => $guestViewer ? null : $group->name,
                'description' => $guestViewer ? null : $group->description,
                // Гостю и «Все сотрудники» — просто «группа»: и пометка, и численность выдали бы размер компании-хозяина
                // (LATER-139)
                'system' => $guestViewer ? null : $group->system_key,
                'archived_at' => $group->archived_at?->toIso8601ZuluString(),
                'members_count' => $guestViewer ? null : $group->membersCount(),
            ],
            'roles' => NodeGrants::values($this->resource['grants']->pluck('role')),
            'added_at' => $this->resource['grants']->min('created_at')->toIso8601ZuluString(),
            'inherited_from' => $inherited ? ['id' => $first->navNode->id, 'name' => $first->navNode->name] : null,
        ];
    }
}
