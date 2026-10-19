<?php

namespace App\Models;

use App\Enums\SpaceRole;
use App\Services\Access\SpaceAccess;
use App\Services\Access\SpaceAccessResolver;
use Database\Factories\SpaceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection as SupportCollection;

/**
 * Пространство — команда со своими досками и участниками. Не удаляется, только архивируется.
 *
 * @property string $id
 * @property string $name
 * @property string $key
 * @property string|null $description
 * @property int $last_card_number
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, SpaceMember> $members
 * @property-read Collection<int, SpaceMember> $admins
 * @property-read int|null $members_count
 * @property-read Collection<int, Board> $boards
 * @property-read Collection<int, SpaceGroup> $groupGrants
 * @property-read NavNode|null $navNode
 */
#[Fillable(['name', 'key', 'description'])]
class Space extends Model
{
    /** @use HasFactory<SpaceFactory> */
    use HasFactory, HasUlids;

    /**
     * Итоговые права пользователей в этом пространстве, уже вычисленные в рамках запроса.
     * Кеш живёт на экземпляре модели: каждый HTTP-запрос получает свежие экземпляры, поэтому
     * кеш не переживает запрос (в том числе в тестах, где контейнер общий) — ADR-0005, ADR-0012.
     *
     * @var array<string, SpaceAccess>
     */
    private array $resolvedAccess = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_card_number' => 'integer',
            'archived_at' => 'datetime',
        ];
    }

    /** @return HasMany<SpaceMember, $this> */
    public function members(): HasMany
    {
        return $this->hasMany(SpaceMember::class);
    }

    /**
     * Доступы групп к пространству (источники доступа; права — только через accessOf()).
     *
     * @return HasMany<SpaceGroup, $this>
     */
    public function groupGrants(): HasMany
    {
        return $this->hasMany(SpaceGroup::class);
    }

    /**
     * Место пространства в дереве навигации (ADR-0013). На доступ не влияет.
     *
     * @return HasOne<NavNode, $this>
     */
    public function navNode(): HasOne
    {
        return $this->hasOne(NavNode::class);
    }

    /** @return HasMany<Board, $this> */
    public function boards(): HasMany
    {
        return $this->hasMany(Board::class);
    }

    /**
     * Все карточки пространства. Для пользователя — только через CardVisibility::scope (ADR-0008).
     *
     * @return HasMany<Card, $this>
     */
    public function cards(): HasMany
    {
        return $this->hasMany(Card::class);
    }

    /** @return HasMany<SpaceMember, $this> */
    public function admins(): HasMany
    {
        return $this->hasMany(SpaceMember::class)->where('role', SpaceRole::Admin);
    }

    /**
     * Только пространства, к которым у пользователя есть доступ (лично или через группу).
     *
     * @param  Builder<Space>  $query
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        $query->whereIn('id', app(SpaceAccessResolver::class)->spaceIdsQuery($user));
    }

    /** @param  Builder<Space>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /**
     * Итоговые права пользователя: все действующие источники доступа (личное участие и группы).
     * Единственный вход для политик и CardVisibility; вычисляется один раз на экземпляр.
     */
    public function accessOf(User $user): SpaceAccess
    {
        return $this->resolvedAccess[(string) $user->getKey()]
            ??= app(SpaceAccessResolver::class)->forSpace($user, $this);
    }

    /** Самая сильная роль пользователя — для показа (my_role); null — доступа нет. Права — через accessOf(). */
    public function roleOf(User $user): ?SpaceRole
    {
        return $this->accessOf($user)->highestRole();
    }

    /**
     * Права пользователя во всех его пространствах одним запросом (для списков): space_id → права.
     *
     * @return SupportCollection<string, SpaceAccess>
     */
    public static function accessesOf(User $user): SupportCollection
    {
        return app(SpaceAccessResolver::class)->forUser($user);
    }

    /** Запомнить уже вычисленные права (списки читают права всех пространств одним запросом). */
    public function rememberAccess(User $user, SpaceAccess $access): void
    {
        $this->resolvedAccess[(string) $user->getKey()] = $access;
    }

    /** Сбросить кеш прав (после изменения участников или групп в этом же запросе). */
    public function forgetResolvedAccess(): void
    {
        $this->resolvedAccess = [];
    }
}
