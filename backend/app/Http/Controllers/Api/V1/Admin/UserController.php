<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Users\BlockUserAction;
use App\Actions\Users\CancelEmailChangeAction;
use App\Actions\Users\ChangeUserRoleAction;
use App\Actions\Users\DeactivateUserAction;
use App\Actions\Users\FormerOwnerGrants;
use App\Actions\Users\ReactivateUserAction;
use App\Actions\Users\RequestEmailChangeAction;
use App\Actions\Users\TerminateUserSessionsAction;
use App\Actions\Users\TransferOwnershipAction;
use App\Actions\Users\UnblockUserAction;
use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ChangeUserEmailRequest;
use App\Http\Requests\Admin\DeactivateUserRequest;
use App\Http\Requests\Admin\ListUsersRequest;
use App\Http\Requests\Admin\TransferOwnershipRequest;
use App\Http\Requests\Admin\UpdateUserRoleRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Люди компании (её «дома», гости и Владелец — участник всех компаний, ADR-0024): роль в компании, деактивация в компании
 * и возврат, отключение учётной записи Владельцем, передача владения, «Завершить все сеансы» и смена email (П2c-2).
 */
class UserController extends Controller
{
    public function index(ListUsersRequest $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        $users = User::query()
            ->whereIn('id', $resolver->companyPeopleIds($company))
            // Статус — в этой компании (П2c): убранный из неё — «Деактивирован», гость — отдельно
            ->when($request->validated('status'), fn ($q, $status) => $q->whereIn('id', $resolver->companyPeopleIdsIn($company, $status)))
            ->when($request->validated('search'), function ($q, $search) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like));
            })
            // «Последняя активность» (П2c-2): только у действующих сотрудников компании, как и в ответе (AdminUserResource) —
            // иначе порядок строк выдал бы скрытое время; без времени — в конце
            ->when($request->sortsByLastSeen(), function ($q) use ($request, $resolver, $company) {
                $homes = $resolver->companyMemberIds($company);
                $q->orderByRaw(
                    'CASE WHEN users.id IN ('.$homes->toSql().') THEN users.last_seen_at END '.$request->sortDirection().' NULLS LAST',
                    $homes->getBindings(),
                );
            })
            ->orderBy('name')
            ->with('emailChangeRequest')
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

    /** Деактивация в компании; по желанию — с передачей доступа преемнику (П2c). */
    public function deactivate(DeactivateUserRequest $request, Company $company, User $user, DeactivateUserAction $action): AdminUserResource
    {
        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company, $request->successor())])[0]);
    }

    /** «Отключить учётную запись» — только Владелец (П2c, решение PM 28.10, п. 2). */
    public function block(Request $request, Company $company, User $user, BlockUserAction $action): AdminUserResource
    {
        Gate::authorize('block', [$user, $company]);

        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company)])[0]);
    }

    public function unblock(Request $request, Company $company, User $user, UnblockUserAction $action): AdminUserResource
    {
        Gate::authorize('block', [$user, $company]);

        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company)])[0]);
    }

    /** «Завершить все сеансы» человека (П2c-2): войти на каждом устройстве он сможет снова, со своим паролем. */
    public function terminateSessions(Request $request, Company $company, User $user, TerminateUserSessionsAction $action): Response
    {
        Gate::authorize('terminateSessions', [$user, $company]);

        $action->handle($request->user(), $user, $company);

        return response()->noContent();
    }

    /** Смена email (П2c-2, LATER-9): письмо со ссылкой на новый адрес; email меняется после перехода по ней. */
    public function requestEmailChange(ChangeUserEmailRequest $request, Company $company, User $user, RequestEmailChangeAction $action): AdminUserResource
    {
        $user = $action->handle($request->user(), $user, $company, $request->string('email')->toString());

        return new AdminUserResource($this->withLatestInvitation($company, [$user])[0]);
    }

    public function cancelEmailChange(Request $request, Company $company, User $user, CancelEmailChangeAction $action): AdminUserResource
    {
        Gate::authorize('changeEmail', [$user, $company]);

        return new AdminUserResource($this->withLatestInvitation($company, [$action->handle($request->user(), $user, $company)])[0]);
    }

    /**
     * Что потеряет Владелец при передаче владения (П2c, решение PM 28.10, п. 6): личный доступ в компаниях, где он не
     * сотрудник, и пространства, где он — последний администратор. Пространства разных компаний — Владелец видит все.
     */
    public function transferImpact(Request $request, Company $company, User $user, FormerOwnerGrants $grants): JsonResponse
    {
        Gate::authorize('transferOwnership', [$user, $company]);

        $impact = $grants->impact($request->user());
        $space = fn (Space $space) => ['id' => $space->id, 'key' => $space->key, 'name' => $space->name];

        return response()->json(['data' => [
            'lost_spaces' => $impact['lost']->map($space)->values(),
            'unmanaged_spaces' => $impact['unmanaged']->map($space)->values(),
        ]]);
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
     * Последнее приглашение человека — в эту компанию (состояние в «Пользователях», Invitation::rememberLatestIn).
     *
     * @param  list<User>  $users
     * @return list<User>
     */
    private function withLatestInvitation(Company $company, array $users): array
    {
        Invitation::rememberLatestIn($company, $users);

        return $users;
    }
}
