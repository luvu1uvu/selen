<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Invitations\InviteUserAction;
use App\Actions\Invitations\ResendInvitationAction;
use App\Actions\Invitations\RevokeInvitationAction;
use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreInvitationRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Company;
use App\Models\Invitation;
use App\Services\Access\AccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class InvitationController extends Controller
{
    private const RELATIONS = ['user.latestInvitation', 'invitedBy'];

    public function index(Request $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', [Invitation::class, $company]);

        $invitations = Invitation::query()
            ->inCompany($company)
            ->with(self::RELATIONS)
            ->orderByDesc('id')
            ->paginate(25);
        // Роли приглашённых в компании и права на них — одним запросом
        $resolver->rememberCompanyPermissions($company, [$request->user(), ...collect($invitations->items())->pluck('user')]);

        return InvitationResource::collection($invitations);
    }

    public function store(StoreInvitationRequest $request, Company $company, InviteUserAction $action): JsonResponse
    {
        $invitation = $action->handle(
            $request->user(),
            $company,
            $request->string('name')->trim()->toString(),
            $request->string('email')->toString(),
            $request->enum('role', CompanyRole::class),
        );

        return (new InvitationResource($invitation->load(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function resend(Request $request, Company $company, Invitation $invitation, ResendInvitationAction $action): InvitationResource
    {
        Gate::authorize('resend', [$invitation, $company]);

        return new InvitationResource($action->handle($request->user(), $invitation, $company)->load(self::RELATIONS));
    }

    public function revoke(Request $request, Company $company, Invitation $invitation, RevokeInvitationAction $action): InvitationResource
    {
        Gate::authorize('revoke', [$invitation, $company]);

        return new InvitationResource($action->handle($request->user(), $invitation, $company)->load(self::RELATIONS));
    }
}
