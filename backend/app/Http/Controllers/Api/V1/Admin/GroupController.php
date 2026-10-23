<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Groups\AddGroupMemberAction;
use App\Actions\Groups\RemoveGroupMemberAction;
use App\Actions\Groups\SaveGroupAction;
use App\Actions\Groups\SetGroupArchivedAction;
use App\Actions\Spaces\AssignSpaceGroupAction;
use App\Actions\Spaces\AssignSpaceRoleAction;
use App\Actions\Spaces\RevokeSpaceGroupAction;
use App\Enums\SpaceRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AssignSpaceGroupRequest;
use App\Http\Requests\Admin\SaveGroupRequest;
use App\Http\Requests\Admin\StoreGroupMemberRequest;
use App\Http\Resources\GroupResource;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Группы пользователей в админке (ADR-0012): список, создание, архив, состав и доступы к пространствам.
 * Только системный администратор. Доступ группы со страницы пространства — Api\V1\SpaceGroupController.
 */
class GroupController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Group::class);

        // Встроенная «Все сотрудники» — первой
        $groups = Group::query()->withCount(['members', 'spaceGrants'])->orderByRaw('system_key IS NULL, lower(name)')->get();

        return GroupResource::collection($groups);
    }

    public function store(SaveGroupRequest $request, SaveGroupAction $action): JsonResponse
    {
        $group = $action->handle($request->user(), $request->validated());

        return (new GroupResource($this->reload($group)))->response()->setStatusCode(201);
    }

    public function show(Group $group): GroupResource
    {
        Gate::authorize('view', $group);

        return new GroupResource($this->reload($group));
    }

    public function update(SaveGroupRequest $request, Group $group, SaveGroupAction $action): GroupResource
    {
        return new GroupResource($this->reload($action->handle($request->user(), $request->validated(), $group)));
    }

    public function archive(Request $request, Group $group, SetGroupArchivedAction $action): GroupResource
    {
        Gate::authorize('archive', $group);

        return new GroupResource($this->reload($action->handle($request->user(), $group, true)));
    }

    public function restore(Request $request, Group $group, SetGroupArchivedAction $action): GroupResource
    {
        Gate::authorize('archive', $group);

        return new GroupResource($this->reload($action->handle($request->user(), $group, false)));
    }

    public function addMember(StoreGroupMemberRequest $request, Group $group, AddGroupMemberAction $action): GroupResource
    {
        $action->handle($request->user(), $group, User::query()->findOrFail($request->validated('user_id')));

        return new GroupResource($this->reload($group));
    }

    public function removeMember(Request $request, Group $group, User $user, RemoveGroupMemberAction $action): Response
    {
        Gate::authorize('update', $group);

        $action->handle($request->user(), $group, $user);

        return response()->noContent();
    }

    /** Выдать или изменить доступ группы к пространству (в журнале — via=admin_panel). */
    public function assignSpace(
        AssignSpaceGroupRequest $request,
        Group $group,
        Space $space,
        AssignSpaceGroupAction $action,
    ): GroupResource {
        $action->handle(
            $request->user(),
            $space,
            $group,
            $request->enum('role', SpaceRole::class),
            $request->boolean('own_cards_only'),
        );

        return new GroupResource($this->reload($group));
    }

    public function revokeSpace(Request $request, Group $group, Space $space, RevokeSpaceGroupAction $action): Response
    {
        Gate::authorize('update', $group);

        $action->handle($request->user(), $space, $group, AssignSpaceRoleAction::VIA);

        return response()->noContent();
    }

    /** Свежий экземпляр со счётчиками, составом и доступами. */
    private function reload(Group $group): Group
    {
        return Group::query()
            ->withCount(['members', 'spaceGrants'])
            ->with(['members', 'spaceGrants.space', 'spaceGrants.role'])
            ->findOrFail($group->id);
    }
}
