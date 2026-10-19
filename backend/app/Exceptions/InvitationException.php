<?php

namespace App\Exceptions;

use App\Enums\InvitationState;
use App\Enums\UserStatus;
use App\Models\Invitation;
use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Приглашение нельзя использовать. Возвращается клиенту как JSON с машинным кодом:
 * { "message": "...", "code": "invitation_expired" }.
 */
class InvitationException extends RuntimeException
{
    public function __construct(public readonly string $errorCode, public readonly int $status)
    {
        parent::__construct(__("selen.invitations.errors.{$errorCode}"));
    }

    public static function invalid(): self
    {
        return new self('invitation_invalid', 404);
    }

    public static function throwUnlessUsable(Invitation $invitation): void
    {
        $code = match ($invitation->state()) {
            InvitationState::Accepted => 'invitation_used',
            InvitationState::Superseded => 'invitation_superseded',
            InvitationState::Revoked => 'invitation_revoked',
            InvitationState::Expired => 'invitation_expired',
            InvitationState::Pending => $invitation->user->status === UserStatus::Invited ? null : 'invitation_revoked',
        };

        if ($code !== null) {
            throw new self($code, 410);
        }
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => $this->errorCode], $this->status);
    }
}
