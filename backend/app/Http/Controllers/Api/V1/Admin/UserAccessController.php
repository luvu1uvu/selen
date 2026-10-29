<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Access\AccessManagerGuard;
use App\Actions\Access\NodeGrants;
use App\Actions\Companies\SetCompanyPermissionsAction;
use App\Enums\Permission;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateCompanyPermissionsRequest;
use App\Models\Company;
use App\Models\Group;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
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

        // Роли выдач — один запрос (их немного: стандартные и роли компании)
        $roles = Role::query()->get()->keyBy('id');
        $spaces = $resolver->explain($user, $company)->map(fn (array $entry) => [
            'space' => $this->space($entry['space']),
            'has_access' => $entry['access']->isMember(),
            // Итог по всем действующим источникам (ADR-0012)
            'role' => $entry['access']->highestRole(),
            'sees_all_cards' => $entry['access']->canSeeAllCards(),
            // Источник — лично или группа, на пространство или через папку (П2d-1), со всеми ролями этого источника
            'sources' => collect($entry['sources'])
                ->groupBy(fn (array $source) => ($source['group']->id ?? '').'|'.($source['folder']->id ?? ''))
                ->map(fn (Collection $same) => [
                    'type' => $same->first()['group'] === null ? 'personal' : 'group',
                    'group' => $same->first()['group'] === null ? null : ['id' => $same->first()['group']->id, 'name' => $same->first()['group']->name],
                    'folder' => $same->first()['folder'] === null ? null : ['id' => $same->first()['folder']->id, 'name' => $same->first()['folder']->name],
                    'roles' => NodeGrants::values($same->map(fn (array $source) => $roles[$source['source']->roleId])),
                    'inactive_reason' => $same->first()['inactive_reason']?->value,
                ])
                ->values(),
        ]);

        $guest = CompanyMembers::guestOf($user, $company->id);

        return response()->json(['data' => [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $company->roleOf($user),
                'status' => CompanyMembers::statusOf($user, $company->id),
                // Гость компании — пометка в шапке страницы, как в списке (UX-ревью П2c-1, U-11)
                'guest' => $guest === null ? null : [
                    'expires_at' => $guest['expires_at']?->toIso8601ZuluString(),
                    'expired' => $guest['expired'],
                ],
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
    public function deactivationImpact(Request $request, Company $company, User $user, AccessManagerGuard $guard): JsonResponse
    {
        $account = $request->boolean('account');
        Gate::authorize($account ? 'block' : 'deactivate', [$user, $company]);

        return response()->json(['data' => [
            // Узел пространства — «Доступ…» в окне деактивации: назначить замену (П2d-1)
            'last_admin_spaces' => $guard->lastAdminSpaces($user, $account ? null : $company)->load('navNode')
                ->map(fn (Space $space) => $this->space($space) + ['node_id' => $space->navNode?->id]),
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
