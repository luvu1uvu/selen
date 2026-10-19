<?php

namespace App\Models;

use App\Enums\ColumnCategory;
use App\Enums\TransitionReason;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Переход карточки — изменение её положения (доска, колонка, дорожка) или категории.
 * Append-only: изменение и удаление запрещены здесь и триггером в БД.
 * Создаётся только через App\Services\Cards\CardPlacement. См. docs/adr/0006-card-transitions.md.
 * Переходы карточек в корзине выборки по умолчанию не видят (метрики их не учитывают, ADR-0015).
 *
 * @property int $id
 * @property string $card_id
 * @property string $space_id
 * @property string|null $from_board_id
 * @property string $to_board_id
 * @property string|null $from_column_id
 * @property string $to_column_id
 * @property string|null $from_lane_id
 * @property string $to_lane_id
 * @property ColumnCategory|null $from_category
 * @property ColumnCategory $to_category
 * @property Carbon $moved_at
 * @property string|null $actor_id
 * @property TransitionReason $reason
 * @property-read User|null $actor
 * @property-read Board|null $fromBoard
 * @property-read Board $toBoard
 * @property-read BoardColumn|null $fromColumn
 * @property-read BoardColumn $toColumn
 * @property-read Lane|null $fromLane
 * @property-read Lane $toLane
 */
class CardTransition extends Model
{
    /** Глобальный scope: только переходы карточек не из корзины. */
    public const OF_LIVE_CARDS = 'of_live_cards';

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'from_category' => ColumnCategory::class,
            'to_category' => ColumnCategory::class,
            'reason' => TransitionReason::class,
            'moved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('История перемещений нельзя изменять (append-only).'));
        static::deleting(fn () => throw new LogicException('Записи истории перемещений нельзя удалять (append-only).'));

        // Карточки в корзине по умолчанию не участвуют в метриках и отчётах (ADR-0015): их переходы остаются
        // в базе, но выборки их не видят. Нужны все — withoutGlobalScope(self::OF_LIVE_CARDS)
        static::addGlobalScope(self::OF_LIVE_CARDS, fn (Builder $query) => $query->whereExists(fn ($sub) => $sub
            ->selectRaw('1')
            ->from('cards')
            ->whereColumn('cards.id', 'card_transitions.card_id')
            ->whereNull('cards.deleted_at')));
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /** @return BelongsTo<Board, $this> */
    public function fromBoard(): BelongsTo
    {
        return $this->belongsTo(Board::class, 'from_board_id');
    }

    /** @return BelongsTo<Board, $this> */
    public function toBoard(): BelongsTo
    {
        return $this->belongsTo(Board::class, 'to_board_id');
    }

    /** @return BelongsTo<BoardColumn, $this> */
    public function fromColumn(): BelongsTo
    {
        return $this->belongsTo(BoardColumn::class, 'from_column_id');
    }

    /** @return BelongsTo<BoardColumn, $this> */
    public function toColumn(): BelongsTo
    {
        return $this->belongsTo(BoardColumn::class, 'to_column_id');
    }

    /** @return BelongsTo<Lane, $this> */
    public function fromLane(): BelongsTo
    {
        return $this->belongsTo(Lane::class, 'from_lane_id');
    }

    /** @return BelongsTo<Lane, $this> */
    public function toLane(): BelongsTo
    {
        return $this->belongsTo(Lane::class, 'to_lane_id');
    }
}
