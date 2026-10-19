<?php

namespace App\Http\Resources;

use App\Models\Group;
use App\Models\SpaceGroup;
use App\Models\User;
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
            'members' => $this->whenLoaded('members', fn () => $this->members
                ->sortBy(fn (User $user) => mb_strtolower($user->name))
                ->values()
                ->map(fn (User $user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'status' => $user->status,
                    'added_at' => $this->addedAt($user),
                ])),
            'spaces' => $this->whenLoaded('spaceGrants', fn () => $this->spaceGrants
                ->sortBy(fn (SpaceGroup $grant) => mb_strtolower($grant->space->name))
                ->values()
                ->map(fn (SpaceGroup $grant) => [
                    'space' => [
                        'id' => $grant->space->id,
                        'key' => $grant->space->key,
                        'name' => $grant->space->name,
                        'archived_at' => $grant->space->archived_at?->toIso8601ZuluString(),
                    ],
                    'role' => $grant->role,
                    'own_cards_only' => $grant->own_cards_only,
                ])),
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
