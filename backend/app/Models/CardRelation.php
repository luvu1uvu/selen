<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Связь «родитель — дочерняя» между карточками одного пространства. У карточки может быть несколько
 * родителей; циклы запрещены (App\Actions\CardRelations\AddCardRelationAction).
 *
 * @property string $id
 * @property string $parent_id
 * @property string $child_id
 * @property string $created_by
 * @property Carbon $created_at
 * @property-read Card $parent
 * @property-read Card $child
 */
class CardRelation extends Model
{
    use HasUlids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<Card, $this> */
    public function parent(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class, 'parent_id')->withTrashed();
    }

    /** @return BelongsTo<Card, $this> */
    public function child(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class, 'child_id')->withTrashed();
    }

    /** Вторая карточка связи, если смотреть со стороны $card. */
    public function otherThan(Card $card): Card
    {
        return $this->parent_id === $card->id ? $this->child : $this->parent;
    }
}
