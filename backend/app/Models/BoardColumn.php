<?php

namespace App\Models;

use App\Enums\ColumnCategory;
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
 * Колонка доски. Два уровня: колонка → подколонки. Тип (category) хранится только у колонки
 * первого уровня; подколонка наследует тип родителя. Карточки лежат только в «листовых» колонках.
 * parent_id не меняется после создания.
 *
 * @property string $id
 * @property string $board_id
 * @property string|null $parent_id
 * @property string $name
 * @property ColumnCategory|null $category
 * @property string $position
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Board $board
 * @property-read BoardColumn|null $parent
 * @property-read Collection<int, BoardColumn> $children
 */
#[Fillable(['board_id', 'parent_id', 'name', 'category', 'position'])]
class BoardColumn extends Model implements HasCompany
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'category' => ColumnCategory::class,
            'archived_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @return BelongsTo<BoardColumn, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** @return HasMany<BoardColumn, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /** @param  Builder<BoardColumn>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function isTopLevel(): bool
    {
        return $this->parent_id === null;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Действующий тип: свой у колонки первого уровня, родителя — у подколонки. */
    public function effectiveCategory(): ColumnCategory
    {
        return $this->category ?? $this->parent->category
            ?? throw new \LogicException("У колонки {$this->id} нет типа.");
    }

    /** Колонка первого уровня, к которой относится эта (сама или родитель). */
    public function topLevelId(): string
    {
        return $this->parent_id ?? $this->id;
    }

    /** Есть ли у колонки активные подколонки (тогда карточки лежат в них, а не в ней). */
    public function hasActiveChildren(): bool
    {
        return $this->children()->active()->exists();
    }

    /** Компания колонки — компания пространства доски (HasCompany: журнал событий). */
    public function companyId(): string
    {
        return $this->relationLoaded('board')
            ? $this->board->companyId()
            : (string) Space::query()->whereIn('id', Board::query()->select('space_id')->whereKey($this->board_id))->value('company_id');
    }
}
