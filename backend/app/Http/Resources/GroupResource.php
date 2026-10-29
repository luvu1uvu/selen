<?php

namespace App\Http\Resources;

use App\Actions\Access\NodeGrants;
use App\Enums\NavNodeType;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\CompanyMembers;
use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Группа в админке. Состав и «Сущности» (папки и пространства с ролями группы, П2d-1) — только если загружены (страница
 * группы).
 *
 * @mixin Group
 */
class GroupResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            // Встроенная группа (everyone): состав вычисляется, группа не редактируется
            'system' => $this->system_key,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            'members_count' => $this->whenCounted('members', fn () => $this->membersCount()),
            // Сколько папок и пространств с доступом группы (П2d-1)
            'entities_count' => $this->whenHas('entities_count', fn () => (int) $this->getAttribute('entities_count')),
            // Страница группы: что текущий пользователь может менять (состав и доступ — выдача доступа, П2c)
            'permissions' => $this->whenLoaded('members', fn () => [
                'manage_members' => $request->user()?->can('manageMembers', $this->resource) ?? false,
                'manage_spaces' => $request->user()?->can('manageSpaces', $this->resource) ?? false,
                // Архив снимает, возврат снова выдаёт её доступ и права (аудит П2c-1, S-2)
                'archive' => $request->user()?->can($this->resource->isArchived() ? 'restore' : 'archive', $this->resource) ?? false,
            ]),
            'members' => $this->whenLoaded('members', fn () => $this->members
                ->sortBy(fn (User $user) => mb_strtolower($user->name))
                ->values()
                ->map(fn (User $user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    // Статус — в компании группы (П2c): убранный из неё остаётся в составе с пометкой
                    'status' => CompanyMembers::statusOf($user, $this->company_id),
                    'added_at' => $this->addedAt($user),
                ])),
            // Вкладка «Сущности» (П2d-1): папки и пространства с ролями группы на каждом
            'entities' => $this->whenLoaded('accessGrants', fn () => $this->accessGrants
                ->groupBy('nav_node_id')
                ->map(fn (Collection $grants) => [
                    'node' => $this->node($grants->first()->navNode),
                    'roles' => NodeGrants::values($grants->pluck('role')),
                ])
                ->sortBy(fn (array $entity) => [$entity['node']['type'] === NavNodeType::Folder ? 0 : 1, mb_strtolower($entity['node']['name'])])
                ->values()),
        ];
    }

    /**
     * Папка или пространство выдачи (ссылка — по ключу пространства, архивное — с пометкой).
     *
     * @return array{id: string, type: NavNodeType, name: string, space: array{id: string, key: string}|null, archived: bool}
     */
    private function node(NavNode $node): array
    {
        /** @var Space|null $space */
        $space = $node->space;

        return [
            'id' => $node->id,
            'type' => $node->type,
            'name' => $space->name ?? (string) $node->name,
            'space' => $space === null ? null : ['id' => $space->id, 'key' => $space->key],
            'archived' => $space?->isArchived() ?? $node->isArchived(),
        ];
    }

    /** Когда человек добавлен в группу (из промежуточной таблицы group_members). */
    private function addedAt(User $user): string
    {
        /** @var Pivot $pivot */
        $pivot = $user->getRelation('pivot');

        return Carbon::parse($pivot->getAttribute('created_at'))->toIso8601ZuluString();
    }
}
