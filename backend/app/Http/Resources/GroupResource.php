<?php

namespace App\Http\Resources;

use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\CompanyMembers;
use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;

/**
 * Группа в админке. Состав и доступы к пространствам — только если загружены (страница группы).
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
            'spaces_count' => $this->whenCounted('spaceGrants'),
            // Страница группы: что текущий пользователь может менять (состав и доступ — выдача доступа, П2c)
            'permissions' => $this->whenLoaded('members', fn () => [
                'manage_members' => $request->user()?->can('manageMembers', $this->resource) ?? false,
                'manage_spaces' => $request->user()?->can('manageSpaces', $this->resource) ?? false,
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
            'spaces' => $this->whenLoaded('spaceGrants', fn () => $this->spaceGrants
                ->sortBy(fn (AccessGrant $grant) => mb_strtolower((string) $grant->space?->name))
                ->values()
                ->map(fn (AccessGrant $grant) => [
                    'space' => $this->space($grant),
                    // Прежний вид API: роль + «только свои карточки» (ADR-0024, П2a)
                    'role' => $grant->legacyRole(),
                    'own_cards_only' => $grant->ownCardsOnly(),
                ])),
        ];
    }

    /**
     * Пространство выдачи (в П2a выдачи — только на пространства).
     *
     * @return array<string, mixed>
     */
    private function space(AccessGrant $grant): array
    {
        /** @var Space $space */
        $space = $grant->space;

        return [
            'id' => $space->id,
            'key' => $space->key,
            'name' => $space->name,
            'archived_at' => $space->archived_at?->toIso8601ZuluString(),
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
