<?php

namespace App\Models;

use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Дорожка доски (горизонтальная полоса). У доски всегда есть хотя бы одна активная дорожка.
 *
 * @property string $id
 * @property string $board_id
 * @property string $name
 * @property string $position
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Board $board
 */
#[Fillable(['board_id', 'name', 'position'])]
class Lane extends Model implements HasCompany
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['archived_at' => 'datetime'];
    }

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @param  Builder<Lane>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** Компания дорожки — компания пространства доски (HasCompany: журнал событий). */
    public function companyId(): string
    {
        return $this->relationLoaded('board')
            ? $this->board->companyId()
            : (string) Space::query()->whereIn('id', Board::query()->select('space_id')->whereKey($this->board_id))->value('company_id');
    }
}
