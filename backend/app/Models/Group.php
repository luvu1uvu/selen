<?php

namespace App\Models;

use App\Enums\UserStatus;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Contracts\HasCompany;
use App\Services\Access\AccessResolver;
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
 * Принадлежит компании (ADR-0024): название уникально в компании, состав — её «дома»; ведёт администратор
 * компании. Не удаляется, только архивируется: архивная группа доступа не даёт.
 *
 * Встроенная группа «Все сотрудники» (system_key = everyone) — у каждой компании своя: состав не хранится — в неё
 * входит каждый активный «дом» компании (вычисляет AccessResolver). Её нельзя архивировать, переименовать, менять
 * состав и делать admin.
 *
 * @property string $id
 * @property string $company_id
 * @property string $name
 * @property string|null $description
 * @property string|null $system_key
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, User> $members
 * @property-read Collection<int, AccessGrant> $spaceGrants
 * @property-read int|null $members_count
 */
#[Fillable(['name', 'description'])]
class Group extends Model implements HasCompany
{
    use BelongsToCompany, HasUlids;

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
     * Выдачи доступа группе (в П2a — только на пространства, ADR-0024).
     *
     * @return HasMany<AccessGrant, $this>
     */
    public function spaceGrants(): HasMany
    {
        return $this->hasMany(AccessGrant::class);
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

    /** Встроенная группа «Все сотрудники» компании. */
    public static function everyone(Company|string $company): self
    {
        return self::query()->inCompany($company)->where('system_key', self::EVERYONE)->firstOrFail();
    }

    /**
     * Число людей в группе: у встроенной «Все сотрудники» — активные «дома» компании, у остальных — members_count
     * (должен быть загружен withCount('members')).
     */
    public function membersCount(): int
    {
        if ($this->system_key === self::EVERYONE) {
            return User::query()
                ->where('status', UserStatus::Active)
                ->whereIn('id', app(AccessResolver::class)->companyMemberIds($this->company_id))
                ->count();
        }

        return (int) $this->getAttribute('members_count');
    }

    /**
     * Вложенный объект адреса (admin/companies/{company}/groups/{group}/members/{user}) ищется среди объектов
     * компании группы — как у Company (scoped binding): человек и пространство другой компании — 404.
     *
     * @param  string  $childType
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveChildRouteBinding($childType, $value, $field): ?Model
    {
        return $this->company->resolveChildRouteBinding($childType, $value, $field);
    }
}
