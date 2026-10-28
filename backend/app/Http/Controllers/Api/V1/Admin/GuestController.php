<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Guests\AddGuestAction;
use App\Actions\Guests\RemoveGuestAction;
use App\Actions\Guests\UpdateGuestAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreGuestRequest;
use App\Http\Requests\Admin\UpdateGuestRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Гости компании (docs/adr/0024-rights-2.md, П2c): сотрудник другой компании с личным доступом к отдельным
 * пространствам. Право «управлять пользователями»; гость в списке «Пользователи» — с бейджем и сроком.
 */
class GuestController extends Controller
{
    public function store(StoreGuestRequest $request, Company $company, AddGuestAction $action, AccessResolver $resolver): JsonResponse
    {
        $guest = $action->handle($request->user(), $company, $request->string('email')->toString(), $request->expiresAt(), $request->spaceGrants());
        $resolver->rememberCompanyPermissions($company, [$request->user(), $guest]);

        return (new AdminUserResource($guest))->response()->setStatusCode(201);
    }

    public function update(UpdateGuestRequest $request, Company $company, User $user, UpdateGuestAction $action): AdminUserResource
    {
        return new AdminUserResource($action->handle($request->user(), $company, $user, $request->expiresAt(), $request->spaceGrants()));
    }

    public function destroy(Request $request, Company $company, User $user, RemoveGuestAction $action): Response
    {
        Gate::authorize('manageGuests', [User::class, $company]);

        $action->handle($request->user(), $company, $user);

        return response()->noContent();
    }
}
