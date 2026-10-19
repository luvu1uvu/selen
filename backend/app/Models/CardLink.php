<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Ссылка на внешний ресурс в карточке (документ, макет Figma и т. п.): только http и https.
 *
 * @property string $id
 * @property string $card_id
 * @property string $url
 * @property string|null $title
 * @property string $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Card $card
 */
#[Fillable(['url', 'title'])]
class CardLink extends Model
{
    use HasUlids;

    /** @return BelongsTo<Card, $this> */
    public function card(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class)->withTrashed();
    }
}
