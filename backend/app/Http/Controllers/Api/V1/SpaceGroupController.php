<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Spaces\GrantSpaceGroupAction;
use App\Actions\Spaces\RevokeSpaceGroupAction;
use App\Actions\Spaces\UpdateSpaceGroupAction;
use App\Enums\SpaceRole;
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
use Illuminate\Support\Facades\Gate;

/**
 * Группы с доступом к пространству — вкладка «Группы» (ADR-0012). Смотреть — все, кроме пользователя
 * только с режимом «только свои карточки»; выдавать, менять и отзывать — администраторы пространства.
 */
class SpaceGroupController extends Controller
{
    public function index(Space $space): AnonymousResourceCollection
    {
        Gate::authorize('viewAccessSources', $space);

        $grants = $space->groupGrants()
            ->with(['group' => fn ($q) => $q->withCount('members'), 'role'])
            ->get()
            ->sortBy(fn (AccessGrant $grant) => mb_strtolower((string) $grant->group?->name))
            ->values();

        return SpaceGroupResource::collection($grants);
    }

    public function store(StoreSpaceGroupRequest $request, Space $space, GrantSpaceGroupAction $action): JsonResponse
    {
        $group = Group::query()->findOrFail($request->validated('group_id'));
        $grant = $action->handle(
            $request->user(),
            $space,
            $group,
            $request->enum('role', SpaceRole::class),
            $request->boolean('own_cards_only'),
        );

        return $this->resource($grant)->response()->setStatusCode(201);
    }

    public function update(
        UpdateSpaceGroupRequest $request,
        Space $space,
        Group $group,
        UpdateSpaceGroupAction $action,
    ): SpaceGroupResource {
        $grant = $action->handle(
            $request->user(),
            $space,
            $group,
            $request->enum('role', SpaceRole::class),
            $request->has('own_cards_only') ? $request->boolean('own_cards_only') : null,
        );

        return $this->resource($grant);
    }

    public function destroy(Request $request, Space $space, Group $group, RevokeSpaceGroupAction $action): Response
    {
        Gate::authorize('manageMembers', $space);

        $action->handle($request->user(), $space, $group);

        return response()->noContent();
    }

    private function resource(AccessGrant $grant): SpaceGroupResource
    {
        return new SpaceGroupResource($grant->load(['group' => fn ($q) => $q->withCount('members'), 'role']));
    }
}
