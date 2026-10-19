<?php

namespace App\Services\Invitations;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;

/**
 * Выпуск приглашения: одноразовый токен для ссылки, в БД — только его хеш.
 */
class InvitationIssuer
{
    public function issue(User $user, ?User $invitedBy): IssuedInvitation
    {
        $token = Str::random(64);

        $invitation = $user->invitations()->create([
            'email' => $user->email,
            'token_hash' => Invitation::hashToken($token),
            'invited_by_id' => $invitedBy?->getKey(),
            'expires_at' => Date::now()->addHours((int) config('selen.invitations.ttl_hours')),
        ]);

        return new IssuedInvitation($invitation, $token);
    }
}
