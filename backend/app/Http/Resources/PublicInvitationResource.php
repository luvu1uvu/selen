<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Минимум данных о приглашении для страницы принятия (доступна без входа).
 *
 * @mixin Invitation
 */
class PublicInvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'name' => $this->user->name,
            'email' => $this->email,
            'expires_at' => $this->expires_at->toIso8601ZuluString(),
        ];
    }
}
