<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Access\GrantableNodes;
use App\Actions\Invitations\InviteUserAction;
use App\Actions\Invitations\ResendInvitationAction;
use App\Actions\Invitations\RevokeInvitationAction;
use App\Enums\CompanyRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreInvitationRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class InvitationController extends Controller
{
    private const RELATIONS = ['user', 'invitedBy'];

    public function index(Request $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', [Invitation::class, $company]);

        $invitations = Invitation::query()
            ->inCompany($company)
            ->with(self::RELATIONS)
            ->orderByDesc('id')
            ->paginate(25);
        $users = collect($invitations->items())->pluck('user')->unique('id');
        // Роли приглашённых в компании и права на них — одним запросом; последнее приглашение — этой компании (S-4)
        $resolver->rememberCompanyPermissions($company, [$request->user(), ...$users]);
        Invitation::rememberLatestIn($company, $users);

        return InvitationResource::collection($invitations);
    }

    /**
     * Ответ: result — invited (ушла ссылка задать пароль) или added (существующая учётная запись сразу получила «дом»,
     * В8); invitation — приглашение (только у invited).
     */
    public function store(StoreInvitationRequest $request, Company $company, InviteUserAction $action): JsonResponse
    {
        $result = $action->handle(
            $request->user(),
            $company,
            $request->string('name')->trim()->toString(),
            $request->string('email')->toString(),
            $request->enum('role', CompanyRole::class),
            $request->nodeGrants(),
        );
        $invitation = $result->invitation?->load(self::RELATIONS);
        if ($invitation !== null) {
            Invitation::rememberLatestIn($company, [$invitation->user]);
        }

        return response()->json(['data' => [
            'result' => $result->result,
            'user' => ['id' => $result->user->id, 'name' => $result->user->name],
            'invitation' => $invitation === null ? null : new InvitationResource($invitation),
        ]], 201);
    }

    /**
     * Папки и пространства, где автор может выдать доступ приглашённому и гостю (GrantableNodes, П2d-1), в порядке дерева
     * с уровнем; гостю окно предлагает только пространства.
     */
    public function nodes(Request $request, Company $company, GrantableNodes $nodes): JsonResponse
    {
        Gate::authorize('viewGrantableSpaces', [User::class, $company]);

        return response()->json(['data' => $nodes->of($request->user(), $company)->map(fn (array $entry) => [
            'id' => $entry['node']->id,
            'type' => $entry['node']->type,
            'name' => $entry['node']->space->name ?? $entry['node']->name,
            'depth' => $entry['depth'],
            'space' => $entry['node']->space === null ? null : ['id' => $entry['node']->space->id, 'key' => $entry['node']->space->key],
        ])->values()]);
    }

    public function resend(Request $request, Company $company, Invitation $invitation, ResendInvitationAction $action): InvitationResource
    {
        Gate::authorize('resend', [$invitation, $company]);

        return $this->latest($company, $action->handle($request->user(), $invitation, $company));
    }

    public function revoke(Request $request, Company $company, Invitation $invitation, RevokeInvitationAction $action): InvitationResource
    {
        Gate::authorize('revoke', [$invitation, $company]);

        return $this->latest($company, $action->handle($request->user(), $invitation, $company));
    }

    private function latest(Company $company, Invitation $invitation): InvitationResource
    {
        $invitation->load(self::RELATIONS);
        Invitation::rememberLatestIn($company, [$invitation->user]);

        return new InvitationResource($invitation);
    }
}
