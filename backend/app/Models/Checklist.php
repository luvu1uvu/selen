<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Чек-лист карточки. Порядок чек-листов и пунктов — дробные ключи (ADR-0007).
 *
 * @property string $id
 * @property string $card_id
 * @property string $title
 * @property string $position
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Card $card
 * @property-read Collection<int, ChecklistItem> $items
 */
#[Fillable(['title'])]
class Checklist extends Model
{
    use HasUlids;

    /** @return BelongsTo<Card, $this> */
    public function card(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class)->withTrashed();
    }

    /** @return HasMany<ChecklistItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(ChecklistItem::class)->orderBy('position');
    }
}
