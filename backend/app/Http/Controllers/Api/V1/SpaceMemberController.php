<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Spaces\RemoveSpaceMemberAction;
use App\Actions\Spaces\UpdateSpaceMemberAction;
use App\Enums\SpaceRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Spaces\StoreSpaceMemberRequest;
use App\Http\Requests\Spaces\UpdateSpaceMemberRequest;
use App\Http\Resources\SpacePersonResource;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessSource;
use App\Services\Access\SpaceAccess;
use App\Services\Access\SpaceAccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * Люди с доступом к пространству — лично и через группы (ADR-0012). Смотреть могут все, у кого есть доступ,
 * управлять личным участием — администраторы пространства. Деактивированные с личным участием остаются
 * в списке (ради истории), войти они не могут.
 */
class SpaceMemberController extends Controller
{
    public function index(Request $request, Space $space, SpaceAccessResolver $resolver): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);

        $accesses = $resolver->usersWithAccess($space);
        $users = User::query()->whereIn('id', $accesses->keys())->get()->keyBy('id');

        $people = collect($this->people($request, $space, $accesses, $users))
            ->sortBy(fn (array $person) => mb_strtolower($person['user']->name))
            ->values();

        return SpacePersonResource::collection($people);
    }

    public function store(StoreSpaceMemberRequest $request, Space $space, AddSpaceMemberAction $action): JsonResponse
    {
        $user = User::query()->findOrFail($request->validated('user_id'));
        $action->handle($request->user(), $space, $user, $request->enum('role', SpaceRole::class));

        return $this->person($request, $space, $user)->response()->setStatusCode(201);
    }

    public function update(
        UpdateSpaceMemberRequest $request,
        Space $space,
        User $user,
        UpdateSpaceMemberAction $action,
    ): SpacePersonResource {
        $action->handle(
            $request->user(),
            $space,
            $user,
            $request->enum('role', SpaceRole::class),
            $request->has('own_cards_only') ? $request->boolean('own_cards_only') : null,
        );

        return $this->person($request, $space, $user);
    }

    public function destroy(Request $request, Space $space, User $user, RemoveSpaceMemberAction $action): Response
    {
        Gate::authorize('manageMembers', $space);

        $action->handle($request->user(), $space, $user);

        return response()->noContent();
    }

    /** Один человек после изменения его личного участия — в том же виде, что в списке. */
    private function person(Request $request, Space $space, User $user): SpacePersonResource
    {
        $access = app(SpaceAccessResolver::class)->forSpace($user, $space);

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

        $personal = $showSources
            ? $space->members()->whereIn('user_id', $accesses->keys())->get()->keyBy('user_id')
            : collect();
        $groupIds = $accesses->flatMap(fn (SpaceAccess $access) => array_filter(array_map(
            fn (AccessSource $source) => $source->groupId,
            $access->sources,
        )))->unique()->values();
        $groups = $showSources && $groupIds->isNotEmpty()
            ? Group::query()->whereIn('id', $groupIds)->get()->keyBy('id')
            : collect();

        return $accesses->map(fn (SpaceAccess $access, string $userId) => [
            'user' => $users[$userId],
            'access' => $access,
            'personal' => $personal->get($userId),
            'groups' => $groups,
            'show_sources' => $showSources,
        ])->values()->all();
    }
}
