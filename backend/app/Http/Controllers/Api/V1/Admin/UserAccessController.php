<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Spaces\SpaceAdminGuard;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Админка → пользователь: к каким пространствам у него доступ и почему (по источникам, ADR-0012),
 * и что будет при деактивации (пространства, где он последний личный администратор).
 */
class UserAccessController extends Controller
{
    public function access(User $user, AccessResolver $resolver): JsonResponse
    {
        Gate::authorize('viewAny', User::class);

        $groups = $user->groups()->orderByRaw('lower(name)')->get();
        // В «Все сотрудники» активный пользователь входит автоматически (состав не хранится)
        if ($user->status === UserStatus::Active) {
            $groups->prepend(Group::everyone());
        }

        $spaces = $resolver->explain($user)->map(fn (array $entry) => [
            'space' => $this->space($entry['space']),
            'has_access' => $entry['access']->isMember(),
            // Итог по всем действующим источникам (ADR-0012)
            'role' => $entry['access']->highestRole(),
            'sees_all_cards' => $entry['access']->canSeeAllCards(),
            // Источник — в прежнем виде API: роль + «только свои карточки» (ADR-0024, П2a)
            'sources' => array_map(fn (array $source) => [
                'type' => $source['group'] === null ? 'personal' : 'group',
                'group' => $source['group'] === null ? null : ['id' => $source['group']->id, 'name' => $source['group']->name],
                'role' => $source['source']->legacyRole(),
                'own_cards_only' => $source['source']->ownCardsOnly(),
                'inactive_reason' => $source['inactive_reason'],
            ], $entry['sources']),
        ]);

        return response()->json(['data' => [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'status' => $user->status,
            ],
            'groups' => $groups->map(fn (Group $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'archived_at' => $group->archived_at?->toIso8601ZuluString(),
            ]),
            'spaces' => $spaces,
        ]]);
    }

    /** Пространства, которые после деактивации останутся без действующего администратора. */
    public function deactivationImpact(User $user, SpaceAdminGuard $guard): JsonResponse
    {
        Gate::authorize('deactivate', $user);

        return response()->json(['data' => [
            'last_admin_spaces' => $guard->lastAdminSpaces($user)->map(fn (Space $space) => $this->space($space)),
        ]]);
    }

    /** @return array<string, mixed> */
    private function space(Space $space): array
    {
        return [
            'id' => $space->id,
            'key' => $space->key,
            'name' => $space->name,
            'archived_at' => $space->archived_at?->toIso8601ZuluString(),
        ];
    }
}
