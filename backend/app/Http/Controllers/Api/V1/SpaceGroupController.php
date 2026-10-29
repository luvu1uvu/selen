<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Access\NodeGrants;
use App\Actions\Access\RevokeNodeAccessAction;
use App\Actions\Access\SetNodeAccessAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Spaces\StoreSpaceGroupRequest;
use App\Http\Requests\Spaces\UpdateSpaceGroupRequest;
use App\Http\Resources\SpaceGroupResource;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\Space;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * Группы с доступом к пространству — вкладка «Группы» (ADR-0012): выдачи на само пространство и унаследованные с папок
 * выше (П2d-1; меняются на своей папке в «Доступе…»). Смотреть — все, кроме пользователя только с режимом «только свои
 * карточки»; выдавать, менять роли и отзывать доступ на само пространство — те, кто управляет в нём доступом.
 */
class SpaceGroupController extends Controller
{
    public function index(Space $space, NodeGrants $grants): AnonymousResourceCollection
    {
        Gate::authorize('viewAccessSources', $space);

        return SpaceGroupResource::collection($this->rows($space, $grants));
    }

    public function store(StoreSpaceGroupRequest $request, Space $space, SetNodeAccessAction $action, NodeGrants $grants): JsonResponse
    {
        $group = Group::query()->findOrFail($request->validated('group_id'));
        $action->handle($request->user(), $space->navNode, $group, $request->roles(), mode: SetNodeAccessAction::CREATE);

        return $this->row($space, $group, $grants)->response()->setStatusCode(201);
    }

    public function update(UpdateSpaceGroupRequest $request, Space $space, Group $group, SetNodeAccessAction $action, NodeGrants $grants): SpaceGroupResource
    {
        if ($grants->of($space->navNode, $group)->isEmpty()) {
            abort(404);
        }
        $action->handle($request->user(), $space->navNode, $group, $request->roles());

        return $this->row($space, $group, $grants);
    }

    public function destroy(Request $request, Space $space, Group $group, RevokeNodeAccessAction $action): Response
    {
        Gate::authorize('manageMembers', $space);

        $action->handle($request->user(), $space->navNode, $group);

        return response()->noContent();
    }

    /**
     * Выдачи группам на пространство и на папки над ним: строка — группа на одном узле со всеми ролями. Сначала на само
     * пространство, затем унаследованные; внутри — по названию группы.
     *
     * @return Collection<int, array{grants: Collection<int, AccessGrant>, space_node_id: string, company_id: string}>
     */
    private function rows(Space $space, NodeGrants $grants, ?Group $only = null): Collection
    {
        $node = $space->navNode;

        return $grants->onPath($node)
            ->whereNotNull('group_id')
            ->when($only !== null, fn (Collection $all) => $all->where('group_id', $only?->id))
            ->groupBy(fn (AccessGrant $grant) => $grant->nav_node_id.'|'.$grant->group_id)
            ->sortBy(fn (Collection $same) => [
                $same->first()->nav_node_id === $node->id ? 0 : 1,
                mb_strtolower((string) $same->first()->group?->name),
            ])
            ->map(fn (Collection $same) => ['grants' => collect($same->values()->all()), 'space_node_id' => $node->id, 'company_id' => $space->company_id])
            ->values();
    }

    /** Группа на самом пространстве после изменения — в том же виде, что в списке. */
    private function row(Space $space, Group $group, NodeGrants $grants): SpaceGroupResource
    {
        $row = $this->rows($space, $grants, $group)->first(fn (array $row) => $row['grants']->first()->nav_node_id === $space->navNode->id);

        return new SpaceGroupResource($row);
    }
}
