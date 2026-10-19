<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Date;

/**
 * Технический аудит входов (IP, user agent). Персональные данные с ограниченным сроком хранения:
 * старые записи удаляет планировщик (`model:prune`, routes/console.php).
 *
 * Записи создаёт только App\Services\EventLog\EventRecorder вместе с событием auth.* в event_log.
 *
 * @property int $id
 * @property Carbon $occurred_at
 * @property int|null $event_log_id
 * @property string $event_type
 * @property string|null $user_id
 * @property string|null $email_attempted
 * @property string|null $ip
 * @property string|null $user_agent
 */
class AuthAuditEntry extends Model
{
    use Prunable;

    protected $table = 'auth_audit';

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
        ];
    }

    /** @return Builder<static> */
    public function prunable(): Builder
    {
        $months = (int) config('selen.auth_audit.retention_months');

        return static::query()->where('occurred_at', '<', Date::now()->subMonths($months));
    }

    /** @return BelongsTo<EventLogEntry, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(EventLogEntry::class, 'event_log_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
