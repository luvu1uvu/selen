<?php

namespace App\Http\Resources;

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
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $actor = $request->user();

        return parent::toArray($request) + [
            'permissions' => [
                'update_role' => $actor->can('updateRole', $this->resource),
                'deactivate' => $actor->can('deactivate', $this->resource),
                'reactivate' => $actor->can('reactivate', $this->resource),
                // Повторить или отозвать приглашение пользователя (InvitationPolicy — по нему же)
                'manage_invitation' => $actor->can('manages', $this->resource),
                'transfer_ownership' => $actor->can('transferOwnership', $this->resource),
            ],
        ];
    }
}
