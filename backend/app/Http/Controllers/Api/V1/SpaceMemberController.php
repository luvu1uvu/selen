<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Access\NodeGrants;
use App\Actions\Access\RevokeNodeAccessAction;
use App\Actions\Access\SetNodeAccessAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Spaces\StoreSpaceMemberRequest;
use App\Http\Requests\Spaces\UpdateSpaceMemberRequest;
use App\Http\Resources\SpacePersonResource;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\AccessSource;
use App\Services\Access\SpaceAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * Люди с доступом к пространству — лично и через группы, на само пространство и через папки выше (ADR-0012, П2d-1).
 * Смотреть могут все, у кого есть доступ, управлять личными ролями на самом пространстве — те, кто управляет в нём
 * доступом (унаследованные с папок меняются на своей папке). Деактивированные и убранные из компании (П2c) с личным
 * участием остаются в списке (ради истории), доступа у них нет.
 */
class SpaceMemberController extends Controller
{
    public function index(Request $request, Space $space, AccessResolver $resolver): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);

        $accesses = $resolver->usersWithAccess($space);
        // Убранные из компании и гости с истёкшим сроком с личным участием остаются в списке без доступа (П2c), как
        // деактивированные
        foreach ($resolver->inactivePersonalUserIds($space) as $id) {
            $accesses[$id] ??= new SpaceAccess;
        }
        $users = User::query()->whereIn('id', $accesses->keys())->get()->keyBy('id');

        $people = collect($this->people($request, $space, $accesses, $users))
            ->sortBy(fn (array $person) => mb_strtolower($person['user']->name))
            ->values();

        return SpacePersonResource::collection($people);
    }

    public function store(StoreSpaceMemberRequest $request, Space $space, SetNodeAccessAction $action): JsonResponse
    {
        $user = User::query()->findOrFail($request->validated('user_id'));
        $action->handle($request->user(), $space->navNode, $user, $request->roles(), mode: SetNodeAccessAction::CREATE);

        return $this->person($request, $space, $user)->response()->setStatusCode(201);
    }

    public function update(
        UpdateSpaceMemberRequest $request,
        Space $space,
        User $user,
        SetNodeAccessAction $action,
        NodeGrants $grants,
    ): SpacePersonResource {
        // Меняются только личные роли на самом пространстве: нет их — нечего менять (как прежде, 404)
        if ($grants->of($space->navNode, $user)->isEmpty()) {
            abort(404);
        }
        $action->handle($request->user(), $space->navNode, $user, $request->roles());

        return $this->person($request, $space, $user);
    }

    public function destroy(Request $request, Space $space, User $user, RevokeNodeAccessAction $action): Response
    {
        Gate::authorize('manageMembers', $space);

        $action->handle($request->user(), $space->navNode, $user);

        return response()->noContent();
    }

    /** Один человек после изменения его личного участия — в том же виде, что в списке. */
    private function person(Request $request, Space $space, User $user): SpacePersonResource
    {
        $access = app(AccessResolver::class)->forSpace($user, $space);

        return new SpacePersonResource($this->people($request, $space, collect([$user->id => $access]), collect([$user->id => $user]))[0]);
    }

    /**
     * @param  Collection<string, SpaceAccess>  $accesses
     * @param  Collection<string, User>  $users
     * @return list<array<string, mixed>>
     */
    private function people(Request $request, Space $space, Collection $accesses, Collection $users): array
    {
        // Подрядчику (все источники с ограничением) источники доступа не показываем — поправка PM
        $showSources = Gate::forUser($request->user())->allows('viewAccessSources', $space);

        // Личные выдачи на само пространство (несколько ролей — несколько строк, П2d-1)
        $personal = $showSources
            ? $space->personalGrants()->with('role')->whereIn('access_grants.user_id', $accesses->keys())->get()->groupBy('user_id')
            : collect();
        $sources = $accesses->flatMap(fn (SpaceAccess $access) => $access->sources);
        $groupIds = $sources->map(fn (AccessSource $source) => $source->groupId)->filter()->unique()->values();
        $groups = $showSources && $groupIds->isNotEmpty()
            ? Group::query()->whereIn('id', $groupIds)->get()->keyBy('id')
            : collect();
        // Папки, с которых доступ унаследован: их названия человек видит и в своём дереве (папка над доступным)
        $folderIds = $sources->map(fn (AccessSource $source) => $source->inheritedFrom)->filter()->unique()->values();
        $folders = $showSources && $folderIds->isNotEmpty()
            ? NavNode::query()->whereIn('id', $folderIds)->get()->keyBy('id')
            : collect();

        return $accesses->map(fn (SpaceAccess $access, string $userId) => [
            'user' => $users[$userId],
            'access' => $access,
            'personal' => $personal->get($userId, collect()),
            'groups' => $groups,
            'folders' => $folders,
            'show_sources' => $showSources,
            'space_company_id' => $space->company_id,
        ])->values()->all();
    }
}
