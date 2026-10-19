<?php

namespace App\Http\Resources;

use App\Models\Group;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\Access\AccessSource;
use App\Services\Access\SpaceAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Человек с доступом к пространству (вкладка «Люди», выбор людей в карточку): откуда у него доступ —
 * лично и/или через какие группы (ADR-0012).
 *
 * Зрителю, у которого все источники с режимом «только свои карточки» (подрядчик), отдаётся только
 * сам пользователь: ни ролей, ни названий групп (поправка PM к этапу 3).
 *
 * @property array{user: User, access: SpaceAccess, personal: SpaceMember|null, groups: Collection<string, Group>, show_sources: bool} $resource
 */
class SpacePersonResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $this->resource['user'];
        $access = $this->resource['access'];
        $personal = $this->resource['personal'];
        $groups = $this->resource['groups'];

        $person = [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->status,
            ],
        ];

        if (! $this->resource['show_sources']) {
            return $person;
        }

        return $person + [
            // Самая сильная роль — для показа; права считаются по источникам
            'role' => $access->highestRole(),
            'personal' => $personal === null ? null : [
                'role' => $personal->role,
                'own_cards_only' => $personal->own_cards_only,
                'added_at' => $personal->created_at->toIso8601ZuluString(),
            ],
            'groups' => collect($access->sources)
                ->reject(fn (AccessSource $source) => $source->isPersonal())
                ->map(fn (AccessSource $source) => [
                    'id' => $source->groupId,
                    'name' => $groups->get((string) $source->groupId)?->name,
                    'role' => $source->role,
                    'own_cards_only' => $source->ownCardsOnly,
                ])
                ->sortBy(fn (array $group) => mb_strtolower((string) $group['name']))
                ->values(),
        ];
    }
}
