<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Invitations\InviteUserAction;
use App\Actions\Invitations\ResendInvitationAction;
use App\Actions\Invitations\RevokeInvitationAction;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreInvitationRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class InvitationController extends Controller
{
    private const RELATIONS = ['user.latestInvitation', 'invitedBy'];

    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Invitation::class);

        $invitations = Invitation::query()
            ->with(self::RELATIONS)
            ->orderByDesc('id')
            ->paginate(25);

        return InvitationResource::collection($invitations);
    }

    public function store(StoreInvitationRequest $request, InviteUserAction $action): JsonResponse
    {
        $invitation = $action->handle(
            $request->user(),
            $request->string('name')->trim()->toString(),
            $request->string('email')->toString(),
            $request->enum('role', UserRole::class),
        );

        return (new InvitationResource($invitation->load(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function resend(Request $request, Invitation $invitation, ResendInvitationAction $action): InvitationResource
    {
        Gate::authorize('resend', $invitation);

        return new InvitationResource($action->handle($request->user(), $invitation)->load(self::RELATIONS));
    }

    public function revoke(Request $request, Invitation $invitation, RevokeInvitationAction $action): InvitationResource
    {
        Gate::authorize('revoke', $invitation);

        return new InvitationResource($action->handle($request->user(), $invitation)->load(self::RELATIONS));
    }
}
