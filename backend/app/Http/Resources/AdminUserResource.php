<?php

namespace App\Http\Resources;

use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Пользователь в админке «Пользователи»: плюс подсказки интерфейсу, какие действия доступны текущему
 * администратору (UserPolicy, ADR-0017). Реальную проверку всегда делает сервер.
 *
 * @mixin User
 */
class AdminUserResource extends UserResource
{
    /**
     * Человек компании из адреса админки: role — его роль в этой компании (owner | admin | member, ADR-0024),
     * permissions — что текущий администратор может с ним сделать в этой компании (UserPolicy).
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $actor */
        $actor = $request->user();
        /** @var Company $company */
        $company = $request->route('company');
        $user = $this->resource;

        return $this->account($company->roleOf($user)) + [
            'permissions' => [
                'update_role' => $actor->can('updateRole', [$user, $company]),
                'deactivate' => $actor->can('deactivate', [$user, $company]),
                'reactivate' => $actor->can('reactivate', [$user, $company]),
                // Повторить или отозвать приглашение пользователя (InvitationPolicy::manages)
                'manage_invitation' => $actor->can('manages', [Invitation::class, $user, $company]),
                'transfer_ownership' => $actor->can('transferOwnership', [$user, $company]),
                // Деактивировать и вернуть может только Владелец: у человека «дома» в нескольких компаниях (до П2c)
                'owner_only' => $actor->can('onlyOwnerManages', [$user, $company]),
            ],
        ];
    }
}
