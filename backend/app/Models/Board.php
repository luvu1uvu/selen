<?php

namespace App\Models;

use App\Models\Contracts\HasCompany;
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
 * @property string $row_id ряд на странице пространства (ADR-0019); position — порядок внутри ряда
 * @property string $name
 * @property string|null $description
 * @property string $position
 * @property bool $auto_assign_on_move переместивший в «в работе»/«готово» становится участником или ответственным
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space $space
 * @property-read BoardRow $row
 * @property-read Collection<int, BoardColumn> $columns
 * @property-read Collection<int, Lane> $lanes
 * @property-read Collection<int, Card> $cards
 */
#[Fillable(['space_id', 'row_id', 'name', 'description', 'position', 'auto_assign_on_move'])]
class Board extends Model implements HasCompany
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

    /** @return BelongsTo<BoardRow, $this> */
    public function row(): BelongsTo
    {
        return $this->belongsTo(BoardRow::class);
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

    /**
     * Порядок раскладки пространства (ADR-0019): ряд, затем место в ряду. Единый порядок досок везде — страница
     * пространства, дерево, метрики; boards.position сам по себе — только порядок внутри ряда.
     *
     * @param  Builder<Board>  $query
     */
    public function scopeInLayoutOrder(Builder $query): void
    {
        $query->orderBy(BoardRow::query()->select('position')->whereColumn('board_rows.id', 'boards.row_id'))
            ->orderBy('boards.position');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Компания доски — компания её пространства (HasCompany: журнал событий). */
    public function companyId(): string
    {
        return $this->relationLoaded('space')
            ? $this->space->company_id
            : (string) Space::query()->whereKey($this->space_id)->value('company_id');
    }
}
