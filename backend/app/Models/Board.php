<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Доска пространства. Не удаляется — только архивируется.
 *
 * @property string $id
 * @property string $space_id
 * @property string $name
 * @property string|null $description
 * @property string $position
 * @property bool $auto_assign_on_move переместивший в «в работе»/«готово» становится участником или ответственным
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space $space
 * @property-read Collection<int, BoardColumn> $columns
 * @property-read Collection<int, Lane> $lanes
 * @property-read Collection<int, Card> $cards
 */
#[Fillable(['space_id', 'name', 'description', 'position', 'auto_assign_on_move'])]
class Board extends Model
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['archived_at' => 'datetime', 'auto_assign_on_move' => 'boolean'];
    }

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /** @return HasMany<BoardColumn, $this> */
    public function columns(): HasMany
    {
        return $this->hasMany(BoardColumn::class);
    }

    /** @return HasMany<Lane, $this> */
    public function lanes(): HasMany
    {
        return $this->hasMany(Lane::class);
    }

    /** @return HasMany<Card, $this> */
    public function cards(): HasMany
    {
        return $this->hasMany(Card::class);
    }

    /** @param  Builder<Board>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
