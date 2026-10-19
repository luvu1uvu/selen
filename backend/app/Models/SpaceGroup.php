<?php

namespace App\Models;

use App\Enums\SpaceRole;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Доступ группы к пространству: роль и режим «только свои карточки» для всей группы (docs/adr/0012-groups.md).
 * Создаётся и меняется только через Actions (app/Actions/Spaces/*SpaceGroup*).
 *
 * @property int $id
 * @property string $space_id
 * @property string $group_id
 * @property SpaceRole $role
 * @property bool $own_cards_only
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space $space
 * @property-read Group $group
 */
#[Fillable(['space_id', 'group_id', 'role', 'own_cards_only'])]
class SpaceGroup extends Model
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

    /** @return BelongsTo<Group, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
