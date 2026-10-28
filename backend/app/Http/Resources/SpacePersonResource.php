<?php

namespace App\Http\Resources;

use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\User;
use App\Services\Access\AccessSource;
use App\Services\Access\CompanyMembers;
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
 * @property array{user: User, access: SpaceAccess, personal: AccessGrant|null, groups: Collection<string, Group>, show_sources: bool, space_company_id: string} $resource
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

        // Гость — человек другой компании: людей компании-хозяина видит только по имени, группы — без названий
        // (решение PM 28.10 по аудиту П2c-1); свой email — свой
        $guestViewer = CompanyMembers::viewsAsGuest($request->user(), $this->resource['space_company_id']);
        $person = [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $guestViewer && $user->isNot($request->user()) ? null : $user->email,
                // Статус — в компании пространства; гость — с бейджем (П2c)
                'status' => CompanyMembers::statusOf($user, $this->resource['space_company_id']),
                'guest' => CompanyMembers::guestOf($user, $this->resource['space_company_id']) !== null,
            ],
        ];

        if (! $this->resource['show_sources']) {
            return $person;
        }

        return $person + [
            // Самая сильная роль — для показа; права считаются по источникам
            'role' => $access->highestRole(),
            // Личная выдача в прежнем виде API: роль + «только свои карточки» (ADR-0024, П2a)
            'personal' => $personal === null ? null : [
                'role' => $personal->legacyRole(),
                'own_cards_only' => $personal->ownCardsOnly(),
                'added_at' => $personal->created_at->toIso8601ZuluString(),
            ],
            'groups' => collect($access->sources)
                ->reject(fn (AccessSource $source) => $source->isPersonal())
                ->map(fn (AccessSource $source) => [
                    'id' => $source->groupId,
                    'name' => $guestViewer ? null : $groups->get((string) $source->groupId)?->name,
                    'role' => $source->legacyRole(),
                    'own_cards_only' => $source->ownCardsOnly(),
                ])
                ->sortBy(fn (array $group) => mb_strtolower((string) $group['name']))
                ->values(),
        ];
    }
}
