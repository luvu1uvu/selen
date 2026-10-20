<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Ряд досок на странице пространства (ADR-0019): в ряду доски стоят рядом, ряды — друг под другом; раскладка общая.
 * Служебная запись раскладки, не данные: ряд без досок (ни активных, ни архивных) удаляет перестановка
 * (MoveBoardAction). Ряд, где остались только архивные доски, не показывается — восстановленная доска встаёт на место.
 *
 * @property string $id
 * @property string $space_id
 * @property string $position
 * @property-read Space $space
 * @property-read Collection<int, Board> $boards
 */
#[Fillable(['space_id', 'position'])]
class BoardRow extends Model
{
    use HasUlids;

    public $timestamps = false;

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /** @return HasMany<Board, $this> */
    public function boards(): HasMany
    {
        return $this->hasMany(Board::class, 'row_id');
    }
}
