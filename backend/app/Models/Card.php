<?php

namespace App\Models;

use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Карточка. Номер {SPACE_KEY}-{number} уникален в пространстве и не переиспользуется.
 * Положение (доска, колонка, дорожка) меняет только App\Services\Cards\CardPlacement —
 * он же пишет историю в card_transitions и пересчитывает first_started_at / completed_at.
 *
 * Удаление — только в корзину (SoftDeletes, docs/adr/0015-card-trash.md): удалённую карточку Eloquent не видит
 * ни в одной выборке, по ссылке — 404. Связанные с ней записи (связи, блокировки, комментарии...) грузят её
 * через withTrashed(), а показывают и проверяют через CardVisibility. Физически карточки не удаляются.
 *
 * @property string $id
 * @property string $space_id
 * @property int $number
 * @property string $board_id
 * @property string $column_id
 * @property string $lane_id
 * @property string $card_type_id
 * @property string $title
 * @property array<mixed>|null $description документ визуального редактора (ADR-0009)
 * @property string $position
 * @property string $created_by
 * @property string $customer_id
 * @property string|null $responsible_id
 * @property Carbon|null $due_date
 * @property Carbon|null $due_at
 * @property bool $is_urgent
 * @property string|null $estimate_hours
 * @property Carbon|null $first_started_at
 * @property Carbon|null $completed_at
 * @property Carbon|null $archived_at
 * @property Carbon|null $deleted_at в корзине с этого момента
 * @property string|null $deleted_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Space $space
 * @property-read Board $board
 * @property-read BoardColumn $column
 * @property-read Lane $lane
 * @property-read CardType $type
 * @property-read User $creator
 * @property-read User $customer
 * @property-read User|null $responsible
 * @property-read User|null $deleter
 * @property-read Collection<int, User> $participants
 * @property-read Collection<int, Label> $labels
 * @property-read Collection<int, Comment> $comments
 * @property-read Collection<int, Checklist> $checklists
 * @property-read Collection<int, CardLink> $links
 * @property-read Collection<int, Attachment> $attachments
 * @property-read int|null $checklist_total счётчик для фасада доски (withCount)
 * @property-read int|null $checklist_done
 * @property-read int|null $comments_count
 * @property-read int|null $attachments_count
 * @property-read Collection<int, CardTransition> $transitions
 * @property-read Collection<int, CardRelation> $parentRelations связи, где карточка — дочерняя
 * @property-read Collection<int, CardRelation> $childRelations связи, где карточка — родитель
 * @property-read Collection<int, CardBlock> $blocks эпизоды блокировки, новые сверху
 * @property-read bool|null $is_blocked для фасада доски (withExists)
 */
#[Fillable(['title', 'description', 'card_type_id', 'customer_id', 'responsible_id', 'due_date', 'due_at', 'is_urgent', 'estimate_hours'])]
class Card extends Model implements HasCompany
{
    use HasUlids, SoftDeletes;

    /** Формат с микросекундами: created_at совпадает с moved_at перехода «created». */
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'number' => 'integer',
            'first_started_at' => 'datetime',
            'completed_at' => 'datetime',
            'archived_at' => 'datetime',
            'deleted_at' => 'datetime',
            'due_date' => 'date',
            'due_at' => 'datetime',
            'is_urgent' => 'boolean',
            'estimate_hours' => 'decimal:1',
            'description' => 'array',
        ];
    }

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @return BelongsTo<BoardColumn, $this> */
    public function column(): BelongsTo
    {
        return $this->belongsTo(BoardColumn::class, 'column_id');
    }

    /** @return BelongsTo<Lane, $this> */
    public function lane(): BelongsTo
    {
        return $this->belongsTo(Lane::class);
    }

    /** @return BelongsTo<CardType, $this> */
    public function type(): BelongsTo
    {
        return $this->belongsTo(CardType::class, 'card_type_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @return BelongsTo<User, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    /** @return BelongsTo<User, $this> */
    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    /** @return BelongsToMany<User, $this> */
    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'card_participants')->withPivot(['added_by', 'created_at']);
    }

    /** @return BelongsToMany<Label, $this> */
    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class, 'card_labels');
    }

    /** Всё, что нужно CardResource (панель карточки). Комментарии — отдельным запросом. */
    public function loadDetails(): self
    {
        // Связанные и блокирующие карточки — с полями для CardVisibility::present() (участники — для canSee;
        // пространство у них то же, CardResource подставляет его сам)
        return $this->load([
            'space', 'board', 'column.parent', 'lane', 'type', 'creator', 'customer', 'responsible', 'participants', 'labels',
            'checklists.items', 'links', 'attachments' => fn ($q) => $q->active()->with('uploader'),
            'parentRelations.parent.participants:id', 'parentRelations.parent.column.parent',
            'childRelations.child.participants:id', 'childRelations.child.column.parent',
            'blocks.starter:id,name', 'blocks.ender:id,name',
            'blocks.blockingCard.participants:id', 'blocks.blockingCard.column.parent',
        ]);
    }

    /** @return HasMany<CardRelation, $this> */
    public function parentRelations(): HasMany
    {
        return $this->hasMany(CardRelation::class, 'child_id')->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<CardRelation, $this> */
    public function childRelations(): HasMany
    {
        return $this->hasMany(CardRelation::class, 'parent_id')->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<CardBlock, $this> */
    public function blocks(): HasMany
    {
        return $this->hasMany(CardBlock::class)->orderByDesc('started_at')->orderByDesc('id');
    }

    /** @return HasMany<Comment, $this> */
    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class)->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<Checklist, $this> */
    public function checklists(): HasMany
    {
        return $this->hasMany(Checklist::class)->orderBy('position');
    }

    /** @return HasManyThrough<ChecklistItem, Checklist, $this> */
    public function checklistItems(): HasManyThrough
    {
        return $this->hasManyThrough(ChecklistItem::class, Checklist::class);
    }

    /** @return HasMany<CardLink, $this> */
    public function links(): HasMany
    {
        return $this->hasMany(CardLink::class)->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<Attachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class)->orderBy('created_at')->orderBy('id');
    }

    /** @return HasMany<CardTransition, $this> */
    public function transitions(): HasMany
    {
        return $this->hasMany(CardTransition::class)->orderBy('moved_at')->orderBy('id');
    }

    /** @param  Builder<Card>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /**
     * «Свои» карточки пользователя: он заказчик, ответственный или участник (ADR-0008).
     *
     * @param  Builder<Card>  $query
     */
    public function scopeInvolving(Builder $query, User $user): void
    {
        $query->where(fn (Builder $q) => $q
            ->where('customer_id', $user->id)
            ->orWhere('responsible_id', $user->id)
            ->orWhereExists(fn ($sub) => $sub->selectRaw('1')
                ->from('card_participants')
                ->whereColumn('card_participants.card_id', 'cards.id')
                ->where('card_participants.user_id', $user->id)));
    }

    /**
     * Поиск по номеру (42, DEV-42) или по части названия.
     *
     * @param  Builder<Card>  $query
     */
    public function scopeMatching(Builder $query, string $term, Space $space): void
    {
        $term = trim($term);
        $like = '%'.addcslashes($term, '%_\\').'%';

        if (preg_match('/^(?:([A-Za-z]{2,10})-)?(\d{1,9})$/', $term, $matches)
            && ($matches[1] === '' || strtoupper($matches[1]) === $space->key)) {
            $query->where(fn (Builder $q) => $q->where('number', (int) $matches[2])->orWhere('title', 'ilike', $like));

            return;
        }

        $query->where('title', 'ilike', $like);
    }

    /** Пользователь — заказчик, ответственный или участник карточки. */
    public function involves(User $user): bool
    {
        if ($this->customer_id === $user->id || $this->responsible_id === $user->id) {
            return true;
        }

        return $this->relationLoaded('participants')
            ? $this->participants->contains('id', $user->id)
            : $this->participants()->whereKey($user->id)->exists();
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /** @return BelongsTo<User, $this> */
    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    protected static function booted(): void
    {
        // История карточки (переходы, блокировки, журнал) — append-only: карточка не удаляется физически
        static::forceDeleting(fn () => throw new LogicException('Карточки не удаляются физически — только в корзину (ADR-0015).'));
    }

    /** Номер для людей и ссылок: DEV-123. */
    public function key(): string
    {
        return $this->space->key.'-'.$this->number;
    }

    /**
     * В URL карточка адресуется номером (/cards/DEV-123). Чужой и несуществующий номер — одинаковый 404.
     */
    public function getRouteKey(): string
    {
        return $this->key();
    }

    /**
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return self::byKey(Card::query(), $value);
    }

    /** Карточка в корзине по номеру DEV-123 — для «Администрирование → Корзина» (права проверяет вызывающий). */
    public static function trashedByKey(string $key): ?self
    {
        return self::byKey(Card::onlyTrashed(), $key);
    }

    /** @param  Builder<Card>  $query */
    private static function byKey(Builder $query, mixed $value): ?self
    {
        if (! is_string($value) || ! preg_match('/^([A-Z]{2,10})-(\d{1,9})$/', $value, $matches)) {
            return null;
        }

        return $query
            ->whereHas('space', fn (Builder $q) => $q->where('key', $matches[1]))
            ->where('number', (int) $matches[2])
            ->first();
    }

    /** Компания карточки — компания её пространства (HasCompany: журнал событий). */
    public function companyId(): string
    {
        return $this->relationLoaded('space')
            ? $this->space->company_id
            : (string) Space::query()->whereKey($this->space_id)->value('company_id');
    }

    /**
     * Вложенный объект адреса (cards/{card}/participants/{user}) ищется среди людей компании карточки (scoped
     * binding, ADR-0024): человек другой компании — 404.
     *
     * @param  string  $childType
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveChildRouteBinding($childType, $value, $field): ?Model
    {
        // Только известные вложенные объекты (participants/{user}): новый вложенный маршрут — сюда осознанно
        if (! in_array($childType, ['user'], true)) {
            throw new LogicException("Вложенный объект {$childType} у Card не ограничен компанией");
        }

        return $this->space->company->resolveChildRouteBinding($childType, $value, $field);
    }
}
