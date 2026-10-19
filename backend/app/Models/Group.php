<?php

namespace App\Models;

use App\Enums\UserStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Группа пользователей — источник доступа к пространствам рядом с личным участием (docs/adr/0012-groups.md).
 * Ведёт только системный администратор. Не удаляется, только архивируется: архивная группа доступа не даёт.
 *
 * Встроенная группа «Все сотрудники» (system_key = everyone): состав не хранится — в неё входит каждый активный
 * пользователь (вычисляет SpaceAccessResolver). Её нельзя архивировать, переименовать, менять состав и делать admin.
 *
 * @property string $id
 * @property string $name
 * @property string|null $description
 * @property string|null $system_key
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, User> $members
 * @property-read Collection<int, SpaceGroup> $spaceGrants
 * @property-read int|null $members_count
 */
#[Fillable(['name', 'description'])]
class Group extends Model
{
    use HasUlids;

    public const EVERYONE = 'everyone';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['archived_at' => 'datetime'];
    }

    /**
     * Состав группы. Меняется только через Actions (app/Actions/Groups).
     *
     * @return BelongsToMany<User, $this>
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'group_members')->withPivot(['added_by', 'created_at']);
    }

    /**
     * Доступы группы к пространствам.
     *
     * @return HasMany<SpaceGroup, $this>
     */
    public function spaceGrants(): HasMany
    {
        return $this->hasMany(SpaceGroup::class);
    }

    /** @param  Builder<Group>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Встроенная группа: состав вычисляется, группа не редактируется (только выдаётся пространствам). */
    public function isSystem(): bool
    {
        return $this->system_key !== null;
    }

    /** Встроенная группа «Все сотрудники». */
    public static function everyone(): self
    {
        return self::query()->where('system_key', self::EVERYONE)->firstOrFail();
    }

    /**
     * Число людей в группе: у встроенной «Все сотрудники» — активные пользователи, у остальных — members_count
     * (должен быть загружен withCount('members')).
     */
    public function membersCount(): int
    {
        if ($this->system_key === self::EVERYONE) {
            return User::query()->where('status', UserStatus::Active)->count();
        }

        return (int) $this->getAttribute('members_count');
    }
}
