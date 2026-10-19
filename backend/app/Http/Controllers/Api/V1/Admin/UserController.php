<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Users\ChangeUserRoleAction;
use App\Actions\Users\DeactivateUserAction;
use App\Actions\Users\ReactivateUserAction;
use App\Actions\Users\TransferOwnershipAction;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ListUsersRequest;
use App\Http\Requests\Admin\TransferOwnershipRequest;
use App\Http\Requests\Admin\UpdateUserRoleRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class UserController extends Controller
{
    public function index(ListUsersRequest $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->with('latestInvitation')
            ->when($request->validated('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->validated('search'), function ($q, $search) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like));
            })
            ->orderBy('name')
            ->paginate(25);

        return AdminUserResource::collection($users);
    }

    public function updateRole(UpdateUserRoleRequest $request, User $user, ChangeUserRoleAction $action): AdminUserResource
    {
        $user = $action->handle($request->user(), $user, $request->enum('role', UserRole::class));

        return new AdminUserResource($user->load('latestInvitation'));
    }

    public function deactivate(Request $request, User $user, DeactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('deactivate', $user);

        return new AdminUserResource($action->handle($request->user(), $user)->load('latestInvitation'));
    }

    public function reactivate(Request $request, User $user, ReactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('reactivate', $user);

        return new AdminUserResource($action->handle($request->user(), $user)->load('latestInvitation'));
    }

    /**
     * Передача владения (ADR-0017). Ответ — новый Владелец с правами, пересчитанными для бывшего (он уже
     * администратор); роль читается из базы на каждый запрос — следующий запрос его сессии идёт с новыми правами.
     */
    public function transferOwnership(TransferOwnershipRequest $request, User $user, TransferOwnershipAction $action): AdminUserResource
    {
        $owner = $action->handle($request->user(), $user, 'admin_panel');
        $request->user()->refresh();

        return new AdminUserResource($owner->load('latestInvitation'));
    }
}
