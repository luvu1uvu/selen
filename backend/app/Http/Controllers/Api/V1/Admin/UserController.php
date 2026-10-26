<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Users\ChangeUserRoleAction;
use App\Actions\Users\DeactivateUserAction;
use App\Actions\Users\ReactivateUserAction;
use App\Actions\Users\TransferOwnershipAction;
use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ListUsersRequest;
use App\Http\Requests\Admin\TransferOwnershipRequest;
use App\Http\Requests\Admin\UpdateUserRoleRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/** Люди компании (её «дома» и Владелец — участник всех компаний, ADR-0024): роль в компании, деактивация, передача владения. */
class UserController extends Controller
{
    public function index(ListUsersRequest $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        $users = User::query()
            ->whereIn('id', $resolver->companyPeopleIds($company))
            ->with('latestInvitation')
            ->when($request->validated('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->validated('search'), function ($q, $search) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like));
            })
            ->orderBy('name')
            ->paginate(25);
        // Роли в компании и права на каждого — одним запросом
        $resolver->rememberCompanyPermissions($company, [$request->user(), ...$users->items()]);

        return AdminUserResource::collection($users);
    }

    public function updateRole(UpdateUserRoleRequest $request, Company $company, User $user, ChangeUserRoleAction $action): AdminUserResource
    {
        $user = $action->handle($request->user(), $user, $company, $request->enum('role', CompanyRole::class));

        return new AdminUserResource($user->load('latestInvitation'));
    }

    public function deactivate(Request $request, Company $company, User $user, DeactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('deactivate', [$user, $company]);

        return new AdminUserResource($action->handle($request->user(), $user, $company)->load('latestInvitation'));
    }

    public function reactivate(Request $request, Company $company, User $user, ReactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('reactivate', [$user, $company]);

        return new AdminUserResource($action->handle($request->user(), $user, $company)->load('latestInvitation'));
    }

    /**
     * Передача владения (ADR-0017). Ответ — новый Владелец с правами, пересчитанными для бывшего (он уже
     * администратор своих компаний); роль читается из базы на каждый запрос — следующий запрос его сессии идёт с новыми
     * правами.
     */
    public function transferOwnership(TransferOwnershipRequest $request, Company $company, User $user, TransferOwnershipAction $action): AdminUserResource
    {
        $owner = $action->handle($request->user(), $user, 'admin_panel');
        $request->user()->refresh();
        $company->forgetResolvedPermissions();

        return new AdminUserResource($owner->load('latestInvitation'));
    }
}
