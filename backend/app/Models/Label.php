<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Метка карточки. space_id = null — общая метка компании (ведёт администратор компании, право «справочники»),
 * иначе — метка пространства той же компании (ведёт администратор пространства). Не удаляется, только архивируется.
 *
 * @property string $id
 * @property string $company_id
 * @property string|null $space_id
 * @property string $name
 * @property string $color
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space|null $space
 */
#[Fillable(['name', 'color'])]
class Label extends Model implements HasCompany
{
    use BelongsToCompany, HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['archived_at' => 'datetime'];
    }

    /** Метка пространства — в компании пространства (составной FK проверяет и явно заданную). */
    protected static function booted(): void
    {
        static::creating(function (Label $label) {
            if ($label->space_id !== null) {
                $label->company_id ??= Space::query()->whereKey($label->space_id)->value('company_id');
            }
        });
    }

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /**
     * Метки, которые можно ставить на карточки пространства: общие и метки этого пространства.
     *
     * @param  Builder<Label>  $query
     */
    public function scopeAvailableIn(Builder $query, Space $space): void
    {
        // Общие метки — только компании пространства
        $query->inCompany($space->company_id)->where(fn (Builder $q) => $q->whereNull('space_id')->orWhere('space_id', $space->id));
    }

    /** @param  Builder<Label>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /** @param  Builder<Label>  $query */
    public function scopeOrdered(Builder $query): void
    {
        // Сначала общие метки компании, затем метки пространства; внутри — по названию
        $query->orderByRaw('space_id IS NOT NULL')->orderByRaw('lower(name)')->orderBy('id');
    }

    public function isCompanyWide(): bool
    {
        return $this->space_id === null;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
