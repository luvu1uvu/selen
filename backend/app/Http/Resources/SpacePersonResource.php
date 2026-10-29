<?php

namespace App\Http\Resources;

use App\Actions\Access\NodeGrants;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\User;
use App\Services\Access\AccessSource;
use App\Services\Access\CompanyMembers;
use App\Services\Access\SpaceAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Человек с доступом к пространству (вкладка «Люди», выбор людей в карточку): откуда у него доступ — лично и/или через
 * какие группы, на само пространство или через папку выше (ADR-0012, П2d-1), с ролями каждого источника.
 *
 * Зрителю, у которого все источники с режимом «только свои карточки» (подрядчик), отдаётся только
 * сам пользователь: ни ролей, ни названий групп (поправка PM к этапу 3).
 *
 * @property array{user: User, access: SpaceAccess, personal: Collection<int, AccessGrant>, groups: Collection<string, Group>, folders: Collection<string, NavNode>, show_sources: bool, space_company_id: string} $resource
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

        $folders = $this->resource['folders'];

        return $person + [
            // Личные роли на самом пространстве — их меняют здесь (П2d-1: ролей может быть несколько)
            'personal' => $personal->isEmpty() ? null : [
                'roles' => NodeGrants::values($personal->pluck('role')),
                'added_at' => $personal->min('created_at')->toIso8601ZuluString(),
            ],
            // Все источники: лично и группы, на пространство и через папки выше — каждый со своими ролями
            'sources' => collect($access->sources)
                ->groupBy(fn (AccessSource $source) => ($source->groupId ?? '').'|'.($source->inheritedFrom ?? ''))
                ->map(function (Collection $same) use ($groups, $folders, $guestViewer) {
                    /** @var AccessSource $source */
                    $source = $same->first();
                    $folder = $source->inheritedFrom === null ? null : $folders->get($source->inheritedFrom);

                    return [
                        'type' => $source->isPersonal() ? 'personal' : 'group',
                        'group' => $source->isPersonal() ? null : [
                            'id' => $source->groupId,
                            'name' => $guestViewer ? null : $groups->get((string) $source->groupId)?->name,
                        ],
                        'folder' => $folder === null ? null : ['id' => $folder->id, 'name' => $folder->name],
                        'roles' => array_values(array_unique($same->map(fn (AccessSource $s) => $s->standardRole->value ?? $s->roleId)->all())),
                        'sort' => [$source->isPersonal() ? 0 : 1, $folder === null ? 0 : 1, mb_strtolower((string) $groups->get((string) $source->groupId)?->name), mb_strtolower((string) $folder?->name)],
                    ];
                })
                ->sortBy(fn (array $row) => $row['sort'])
                ->map(fn (array $row) => collect($row)->except('sort')->all())
                ->values(),
        ];
    }
}
