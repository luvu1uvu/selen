<?php

namespace App\Models;

use App\Enums\InvitationState;
use Database\Factories\InvitationFactory;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Приглашение в систему. Записи не удаляются.
 *
 * @property string $id
 * @property string $user_id
 * @property string $email
 * @property string $token_hash
 * @property string|null $invited_by_id
 * @property Carbon $expires_at
 * @property Carbon|null $accepted_at
 * @property Carbon|null $revoked_at
 * @property string|null $superseded_by_id
 * @property Carbon $created_at
 * @property-read User $user
 * @property-read User|null $invitedBy
 */
class Invitation extends Model
{
    /** @use HasFactory<InvitationFactory> */
    use HasFactory, HasUlids;

    protected $guarded = [];

    protected $hidden = ['token_hash'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /** sha256 от токена из ссылки. В БД хранится только хеш. */
    public static function hashToken(#[\SensitiveParameter] string $token): string
    {
        return hash('sha256', $token);
    }

    public static function findByToken(#[\SensitiveParameter] string $token): ?self
    {
        return static::query()->where('token_hash', static::hashToken($token))->first();
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_id');
    }

    public function state(): InvitationState
    {
        return match (true) {
            $this->accepted_at !== null => InvitationState::Accepted,
            $this->superseded_by_id !== null => InvitationState::Superseded,
            $this->revoked_at !== null => InvitationState::Revoked,
            $this->expires_at->isPast() => InvitationState::Expired,
            default => InvitationState::Pending,
        };
    }

    /** Ожидает принятия или истекло — то есть ещё не закрыто. */
    public function isOpen(): bool
    {
        return in_array($this->state(), [InvitationState::Pending, InvitationState::Expired], true);
    }
}
