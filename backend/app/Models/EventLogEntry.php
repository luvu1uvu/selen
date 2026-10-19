<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Запись журнала событий. Только чтение и добавление (append-only).
 *
 * Создавать записи — только через App\Services\EventLog\EventRecorder.
 * Изменение и удаление запрещены здесь (исключение) и в БД (триггер).
 *
 * @property int $id
 * @property Carbon $occurred_at
 * @property string $event_type
 * @property string|null $actor_id
 * @property string|null $subject_type
 * @property string|null $subject_id
 * @property array<string, mixed> $payload
 * @property array<string, mixed> $meta
 * @property-read User|null $actor
 * @property-read AuthAuditEntry|null $authAudit
 */
class EventLogEntry extends Model
{
    protected $table = 'event_log';

    public $timestamps = false;

    protected $guarded = [];

    /** Формат с микросекундами: порядок событий важен для будущих метрик. */
    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
            'payload' => 'array',
            'meta' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Журнал событий нельзя изменять (append-only).'));
        static::deleting(fn () => throw new LogicException('Записи журнала событий нельзя удалять (append-only).'));
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * IP и user agent события входа (есть только у auth.*, пока не истёк срок хранения).
     *
     * @return HasOne<AuthAuditEntry, $this>
     */
    public function authAudit(): HasOne
    {
        return $this->hasOne(AuthAuditEntry::class, 'event_log_id');
    }

    /** @return MorphTo<Model, $this> */
    public function subject(): MorphTo
    {
        return $this->morphTo();
    }
}
