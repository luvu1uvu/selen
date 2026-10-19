<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            'status' => $this->status,
            'timezone' => $this->timezone,
            'last_login_at' => $this->last_login_at?->toIso8601ZuluString(),
            'deactivated_at' => $this->deactivated_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            // Только в админских списках (загружается явно)
            'invitation' => $this->whenLoaded('latestInvitation', fn () => $this->latestInvitation === null ? null : [
                'id' => $this->latestInvitation->id,
                'state' => $this->latestInvitation->state(),
                'expires_at' => $this->latestInvitation->expires_at->toIso8601ZuluString(),
            ]),
        ];
    }
}
