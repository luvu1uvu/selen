<?php

namespace App\Services\EventLog;

use App\Enums\EventType;
use App\Models\AuthAuditEntry;
use App\Models\EventLogEntry;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;

/**
 * Единственная точка записи в журнал событий (event_log).
 *
 * Вызывайте внутри той же транзакции, что и доменное изменение: тогда событие
 * и изменение данных либо сохраняются вместе, либо не сохраняются вовсе.
 *
 * Персональные данные (email, имена, IP) в журнал не пишутся — только идентификаторы
 * (docs/adr/0003-event-log.md). IP и user agent событий входа уходят в auth_audit:
 * эта таблица не append-only и очищается по сроку хранения.
 */
class EventRecorder
{
    /**
     * @param  User|null  $actor  кто совершил действие; null — система или аноним
     * @param  Model|null  $subject  над чем совершено действие
     * @param  array<string, mixed>  $payload  снимок данных события: id и значения перечислений, без ПДн
     * @param  string|null  $attemptedEmail  введённый email, если пользователь не найден (только для auth.*,
     *                                       пишется в auth_audit, не в журнал)
     */
    public function record(
        EventType $type,
        ?User $actor = null,
        ?Model $subject = null,
        array $payload = [],
        ?CarbonInterface $occurredAt = null,
        ?string $attemptedEmail = null,
    ): EventLogEntry {
        $entry = EventLogEntry::query()->create([
            'occurred_at' => $occurredAt ?? Date::now(),
            'event_type' => $type->value,
            'actor_id' => $actor?->getKey(),
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'payload' => $payload,
            'meta' => ['source' => $this->isHttp() ? 'http' : 'console'],
        ]);

        if ($type->isAuth() && $this->isHttp()) {
            $this->audit($entry, $actor ?? ($subject instanceof User ? $subject : null), $attemptedEmail);
        }

        return $entry;
    }

    private function audit(EventLogEntry $entry, ?User $user, ?string $attemptedEmail): void
    {
        $request = request();

        AuthAuditEntry::query()->create([
            'occurred_at' => $entry->occurred_at,
            'event_log_id' => $entry->id,
            'event_type' => $entry->event_type,
            'user_id' => $user?->getKey(),
            'email_attempted' => $user === null ? $attemptedEmail : null,
            'ip' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }

    private function isHttp(): bool
    {
        return ! app()->runningInConsole() || app()->runningUnitTests();
    }
}
