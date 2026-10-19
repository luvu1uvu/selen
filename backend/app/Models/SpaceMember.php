<?php

namespace App\Models;

use App\Enums\SpaceRole;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Участие пользователя в пространстве. Создаётся и меняется только через Actions (app/Actions/Spaces).
 *
 * @property int $id
 * @property string $space_id
 * @property string $user_id
 * @property SpaceRole $role
 * @property bool $own_cards_only режим «только свои карточки» (ADR-0008)
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space $space
 * @property-read User $user
 */
#[Fillable(['space_id', 'user_id', 'role', 'own_cards_only'])]
class SpaceMember extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => SpaceRole::class,
            'own_cards_only' => 'boolean',
        ];
    }

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
