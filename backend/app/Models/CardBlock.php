<?php

namespace App\Models;

use App\Enums\BlockEndReason;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Эпизод блокировки карточки (docs/adr/0011-card-blocks.md). Причина — блокирующая карточка и/или текст.
 * Строка не перезаписывается: разрешено только закрыть открытый эпизод (ended_*), удалять нельзя —
 * это проверяет и триггер в БД. По этой истории на этапе 5 считается время разрешения блокировок.
 *
 * @property string $id
 * @property string $card_id
 * @property string|null $blocking_card_id
 * @property string|null $reason
 * @property Carbon $started_at
 * @property string $started_by
 * @property Carbon|null $ended_at
 * @property string|null $ended_by
 * @property BlockEndReason|null $end_reason
 * @property-read Card $card
 * @property-read Card|null $blockingCard
 * @property-read User $starter
 * @property-read User|null $ender
 */
class CardBlock extends Model
{
    use HasUlids;

    public $timestamps = false;

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'end_reason' => BlockEndReason::class,
        ];
    }

    protected static function booted(): void
    {
        static::deleting(fn () => throw new LogicException('Историю блокировок нельзя удалять.'));
    }

    /** @return BelongsTo<Card, $this> */
    public function card(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class)->withTrashed();
    }

    /** @return BelongsTo<Card, $this> */
    public function blockingCard(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class, 'blocking_card_id')->withTrashed();
    }

    /** @return BelongsTo<User, $this> */
    public function starter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'started_by');
    }

    /** @return BelongsTo<User, $this> */
    public function ender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ended_by');
    }

    /** @param  Builder<CardBlock>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('ended_at');
    }

    public function isActive(): bool
    {
        return $this->ended_at === null;
    }
}
