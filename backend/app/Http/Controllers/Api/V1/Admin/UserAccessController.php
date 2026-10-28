<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Companies\SetCompanyPermissionsAction;
use App\Actions\Spaces\SpaceAdminGuard;
use App\Enums\Permission;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateCompanyPermissionsRequest;
use App\Models\Company;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Админка компании → человек: к каким пространствам компании у него доступ и почему (по источникам, ADR-0012),
 * и что будет при деактивации (пространства компании, где он последний личный администратор). Пространства и группы
 * других компаний не показываются (ADR-0024).
 */
class UserAccessController extends Controller
{
    public function access(Company $company, User $user, AccessResolver $resolver): JsonResponse
    {
        Gate::authorize('viewAny', [User::class, $company]);

        $groups = $user->groups()->inCompany($company)->orderByRaw('lower(name)')->get();
        // В «Все сотрудники» компании активный действующий «дом» входит автоматически (состав не хранится); Владелец без
        // «дома» в ней и гость — нет
        if ($user->status === UserStatus::Active && $resolver->isHome($user, $company)) {
            $groups->prepend(Group::everyone($company));
        }

        $spaces = $resolver->explain($user, $company)->map(fn (array $entry) => [
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
                'inactive_reason' => $source['inactive_reason']?->value,
            ], $entry['sources']),
        ]);

        return response()->json(['data' => [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $company->roleOf($user),
                'status' => CompanyMembers::statusOf($user, $company->id),
            ],
            'groups' => $groups->map(fn (Group $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'archived_at' => $group->archived_at?->toIso8601ZuluString(),
            ]),
            'spaces' => $spaces,
        ]]);
    }

    /**
     * Пространства, которые после деактивации в компании останутся без действующего администратора; с account=1 —
     * после отключения учётной записи Владельцем: во всех компаниях человека (аудит S-1).
     */
    public function deactivationImpact(Request $request, Company $company, User $user, SpaceAdminGuard $guard): JsonResponse
    {
        $account = $request->boolean('account');
        Gate::authorize($account ? 'block' : 'deactivate', [$user, $company]);

        return response()->json(['data' => [
            'last_admin_spaces' => $guard->lastAdminSpaces($user, $account ? null : $company)->map(fn (Space $space) => $this->space($space)),
        ]]);
    }

    /**
     * «Права компании» человека (П2c): каждое выдаваемое право — выдано ли лично, через какие группы, есть ли как
     * у администратора компании, итог и может ли автор его менять.
     */
    public function permissions(Request $request, Company $company, User $user, AccessResolver $resolver): JsonResponse
    {
        Gate::authorize('managePermissions', [$user, $company]);

        return response()->json(['data' => $this->permissionsOf($request->user(), $company, $user, $resolver)]);
    }

    public function updatePermissions(UpdateCompanyPermissionsRequest $request, Company $company, User $user, SetCompanyPermissionsAction $action, AccessResolver $resolver): JsonResponse
    {
        $action->handle($request->user(), $company, $user, $request->permissions());

        return response()->json(['data' => $this->permissionsOf($request->user(), $company, $user, $resolver)]);
    }

    /** @return list<array<string, mixed>> */
    private function permissionsOf(User $actor, Company $company, User $user, AccessResolver $resolver): array
    {
        $company->forgetResolvedPermissions();
        $access = $company->permissionsOf($user);
        $sources = $resolver->companyPermissionSources($user, $company);
        $editable = SetCompanyPermissionsAction::editableBy($actor);

        return array_map(fn (Permission $permission) => [
            'permission' => $permission->value,
            'personal' => in_array($permission->value, $sources['personal'], true),
            'groups' => array_map(fn (Group $group) => ['id' => $group->id, 'name' => $group->name], $sources['groups'][$permission->value] ?? []),
            // Есть у администратора компании по умолчанию (галочка у него ничего не добавит)
            'by_admin_role' => $access->isAdmin() && in_array($permission, Permission::companyAdminDefaults(), true),
            'effective' => $access->allows($permission),
            'editable' => in_array($permission, $editable, true),
        ], Permission::grantable());
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
