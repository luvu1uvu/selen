<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Тип карточки (Задача, Баг, ...). Глобальный справочник, управляет системный администратор.
 *
 * @property string $id
 * @property string $name
 * @property string $color
 * @property bool $is_default
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
#[Fillable(['name', 'color'])]
class CardType extends Model
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    /** @param  Builder<CardType>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /** @param  Builder<CardType>  $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('created_at')->orderBy('id');
    }

    public static function default(): self
    {
        return static::query()->where('is_default', true)->firstOrFail();
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
