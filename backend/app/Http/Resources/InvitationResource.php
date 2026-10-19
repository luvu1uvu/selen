<?php

namespace App\Http\Resources;

use App\Enums\InvitationState;
use App\Enums\UserStatus;
use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Приглашение для админки. Ожидает загруженные связи user.latestInvitation и invitedBy.
 *
 * @mixin Invitation
 */
class InvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $state = $this->state();
        $isLatest = $this->user->latestInvitation?->is($this->resource) ?? false;

        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->user->name,
            'email' => $this->email,
            'role' => $this->user->role,
            'state' => $state,
            'expires_at' => $this->expires_at->toIso8601ZuluString(),
            'accepted_at' => $this->accepted_at?->toIso8601ZuluString(),
            'revoked_at' => $this->revoked_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            'invited_by' => $this->invitedBy === null ? null : [
                'id' => $this->invitedBy->id,
                'name' => $this->invitedBy->name,
            ],
            // Состояние приглашения и права текущего администратора (приглашённым админом управляет Владелец)
            'can_resend' => $isLatest && ! $this->user->hasActivated() && $state !== InvitationState::Accepted
                && $request->user()->can('resend', $this->resource),
            'can_revoke' => $this->isOpen() && $this->user->status === UserStatus::Invited
                && $request->user()->can('revoke', $this->resource),
        ];
    }
}
