<?php

namespace App\Models;

use App\Enums\CardScope;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;
use Illuminate\Support\Carbon;

/**
 * Выдача доступа: субъект (пользователь или группа, в том числе «Все сотрудники») × узел дерева × роль
 * (docs/adr/0024-rights-2.md). В П2a узлы — только пространства, у субъекта на узле одна роль. Компания выдачи —
 * компания узла (составные FK: узел и группа — той же компании; роль — стандартная или этой компании, триггер).
 * Создаётся и меняется только через Actions (app/Actions/Spaces); права по выдачам вычисляет только
 * App\Services\Access\AccessResolver.
 *
 * @property int $id
 * @property string $company_id
 * @property string $nav_node_id
 * @property string|null $user_id
 * @property string|null $group_id
 * @property string $role_id
 * @property string|null $granted_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read NavNode $navNode
 * @property-read Space|null $space
 * @property-read User|null $user
 * @property-read Group|null $group
 * @property-read Role $role
 */
#[Fillable(['nav_node_id', 'user_id', 'group_id', 'role_id', 'granted_by'])]
class AccessGrant extends Model implements HasCompany
{
    use BelongsToCompany;

    /** Выдача — в компании узла (составной FK проверяет и явно заданную). */
    protected static function booted(): void
    {
        static::creating(function (AccessGrant $grant) {
            $grant->company_id ??= NavNode::query()->whereKey($grant->nav_node_id)->value('company_id');
        });
    }

    /** @return BelongsTo<NavNode, $this> */
    public function navNode(): BelongsTo
    {
        return $this->belongsTo(NavNode::class);
    }

    /**
     * Пространство узла выдачи.
     *
     * @return HasOneThrough<Space, NavNode, $this>
     */
    public function space(): HasOneThrough
    {
        return $this->hasOneThrough(Space::class, NavNode::class, 'id', 'id', 'nav_node_id', 'space_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Group, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Выдачи пространству (на его узел в дереве).
     *
     * @param  Builder<AccessGrant>  $query
     */
    public function scopeOnSpace(Builder $query, Space|string $space): void
    {
        $spaceId = $space instanceof Space ? $space->getKey() : $space;

        $query->whereIn('nav_node_id', NavNode::query()->select('id')->where('space_id', $spaceId));
    }

    /** Стандартная роль выдачи; null — пользовательская роль (П2e). Ожидает загруженную role. */
    public function standardRole(): ?StandardRole
    {
        return $this->role->key;
    }

    /** Роль в API пространств (admin | editor | commenter); у пользовательской роли её нет — null. */
    public function legacyRole(): ?SpaceRole
    {
        return $this->standardRole()?->legacyRole();
    }

    /** «Только свои карточки» в API пространств — область карточек роли. */
    public function ownCardsOnly(): bool
    {
        return $this->role->card_scope === CardScope::Own;
    }
}
