<?php

namespace App\Http\Resources;

use App\Actions\Access\NodeGrants;
use App\Models\AccessGrant;
use App\Models\NavNode;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * «Доступ…» узла дерева (П2d-1): выдачи на сам узел и унаследованные с папок выше (`inherited_from` — папка, где выдача
 * меняется). Одна строка — субъект на одном узле со всеми его ролями. Сначала выдачи на сам узел (группы, затем люди по
 * имени), потом — от ближней папки к дальней. Только админка компании: люди с email.
 *
 * @property array{node: NavNode, grants: Collection<int, AccessGrant>} $resource
 */
class NodeAccessResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $node = $this->resource['node'];
        // Узлы выдач в порядке пути (сам узел, затем папки снизу вверх) — его задаёт NodeGrants::onPath
        $distance = $this->resource['grants']->pluck('nav_node_id')->unique()->values()->flip();
        $rows = $this->resource['grants']
            ->groupBy(fn (AccessGrant $grant) => $grant->nav_node_id.'|'.($grant->user_id ?? 'g:'.$grant->group_id))
            ->map(function (Collection $grants) use ($node, $distance) {
                /** @var AccessGrant $first */
                $first = $grants->first();
                $inherited = $first->nav_node_id !== $node->id;

                return [
                    'subject' => $first->user_id !== null ? 'user' : 'group',
                    'user' => $first->user === null ? null : [
                        'id' => $first->user->id,
                        'name' => $first->user->name,
                        'email' => $first->user->email,
                        // Статус — в компании узла (П2c): убранный из неё — «деактивирован», гость — бейдж
                        'status' => CompanyMembers::statusOf($first->user, $node->company_id),
                        'guest' => CompanyMembers::guestOf($first->user, $node->company_id) !== null,
                    ],
                    'group' => $first->group === null ? null : [
                        'id' => $first->group->id,
                        'name' => $first->group->name,
                        'system' => $first->group->system_key,
                        'archived_at' => $first->group->archived_at?->toIso8601ZuluString(),
                    ],
                    'roles' => NodeGrants::values($grants->pluck('role')),
                    'inherited_from' => $inherited ? ['id' => $first->navNode->id, 'name' => $first->navNode->name] : null,
                    'sort' => [
                        $distance[$first->nav_node_id],
                        $first->user_id === null ? 0 : 1,
                        $first->group?->system_key === null ? 1 : 0,
                        mb_strtolower((string) ($first->user->name ?? $first->group->name ?? '')),
                    ],
                ];
            })
            ->sortBy(fn (array $row) => $row['sort'])
            ->map(fn (array $row) => collect($row)->except('sort')->all())
            ->values();

        return [
            'node' => [
                'id' => $node->id,
                'type' => $node->type,
                'name' => $node->space->name ?? $node->name,
                'space' => $node->space === null ? null : ['id' => $node->space->id, 'key' => $node->space->key],
            ],
            'grants' => $rows,
        ];
    }
}
