<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Invitations\AcceptInvitationAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AcceptInvitationRequest;
use App\Http\Resources\PublicInvitationResource;
use App\Http\Resources\UserResource;

/**
 * Страница принятия приглашения (доступна без входа).
 */
class InvitationAcceptanceController extends Controller
{
    public function show(string $token, AcceptInvitationAction $action): PublicInvitationResource
    {
        return new PublicInvitationResource($action->findUsable($token));
    }

    public function store(AcceptInvitationRequest $request, string $token, AcceptInvitationAction $action): UserResource
    {
        $user = $action->handle($token, $request->string('password')->toString());

        $request->session()->regenerate();

        return new UserResource($user);
    }
}
