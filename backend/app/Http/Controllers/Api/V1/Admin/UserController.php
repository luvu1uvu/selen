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
use App\Models\Invitation;
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
            ->when($request->validated('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->validated('search'), function ($q, $search) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like));
            })
            ->orderBy('name')
            ->paginate(25);
        // Роли в компании и права на каждого — одним запросом
        $resolver->rememberCompanyPermissions($company, [$request->user(), ...$users->items()]);
        $this->withLatestInvitation($company, $users->items());

        return AdminUserResource::collection($users);
    }

    public function updateRole(UpdateUserRoleRequest $request, Company $company, User $user, ChangeUserRoleAction $action): AdminUserResource
    {
        $user = $action->handle($request->user(), $user, $company, $request->enum('role', CompanyRole::class));

        return new AdminUserResource($this->withLatestInvitation($company, [$user])[0]);
    }

    public function deactivate(Request $request, Company $company, User $user, DeactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('deactivate', [$user, $company]);

        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company)])[0]);
    }

    public function reactivate(Request $request, Company $company, User $user, ReactivateUserAction $action): AdminUserResource
    {
        Gate::authorize('reactivate', [$user, $company]);

        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company)])[0]);
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

        return new AdminUserResource($this->withLatestInvitation($company, [$owner])[0]);
    }

    /**
     * Последнее приглашение человека — в эту компанию (состояние в «Пользователях»): Владелец и человек с «домами»
     * в нескольких компаниях видны в нескольких компаниях, приглашение другой компании здесь не показывается.
     *
     * @param  list<User>  $users
     * @return list<User>
     */
    private function withLatestInvitation(Company $company, array $users): array
    {
        $ids = array_map(fn (User $user) => $user->id, $users);
        $latest = Invitation::query()
            ->whereIn('id', Invitation::query()->inCompany($company)->whereIn('user_id', $ids)->groupBy('user_id')->selectRaw('max(id)'))
            ->get()
            ->keyBy('user_id');

        foreach ($users as $user) {
            $user->setRelation('latestInvitation', $latest->get($user->id));
        }

        return $users;
    }
}
