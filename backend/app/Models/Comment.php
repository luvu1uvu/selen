<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Комментарий к карточке — документ визуального редактора (ADR-0009).
 * Удаление мягкое: строка остаётся с пометкой «Комментарий удалён», текст стирается (решение PM).
 *
 * @property string $id
 * @property string $card_id
 * @property string $author_id
 * @property array<mixed>|null $body
 * @property Carbon|null $edited_at
 * @property Carbon|null $deleted_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Card $card
 * @property-read User $author
 */
class Comment extends Model
{
    use HasUlids;

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'body' => 'array',
            'edited_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Card, $this> */
    public function card(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class)->withTrashed();
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function isDeleted(): bool
    {
        return $this->deleted_at !== null;
    }
}
