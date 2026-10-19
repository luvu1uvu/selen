<?php

namespace App\Actions\Cards;

use App\Enums\EventType;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardPeople;
use App\Services\Cards\MentionSync;
use App\Services\EventLog\EventRecorder;
use App\Support\RichText\RichTextDocument;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Поля карточки: название, описание, тип, заказчик, ответственный, срок, «Срочно», оценка.
 *
 * В журнал — список изменённых полей; для простых полей ещё и значения «было/стало» (changes).
 * Тексты (название, описание) в журнал не пишутся — в них может быть что угодно, в том числе ПДн.
 */
class UpdateCardAction
{
    /** Поля, для которых в журнал пишется «было/стало»: идентификаторы, даты, флаги, числа. */
    private const TRACKED = ['card_type_id', 'customer_id', 'responsible_id', 'due_date', 'due_at', 'is_urgent', 'estimate_hours'];

    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly CardPeople $people,
        private readonly MentionSync $mentions,
    ) {}

    /**
     * @param  array<string, mixed>  $data  проверенные UpdateCardRequest поля
     */
    public function handle(User $actor, Card $card, array $data): Card
    {
        return DB::transaction(function () use ($actor, $card, $data) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            // Срок — либо дата без времени, либо точный момент: новое значение заменяет другое
            if (($data['due_date'] ?? null) !== null) {
                $data['due_at'] = null;
            }
            if (($data['due_at'] ?? null) !== null) {
                $data['due_at'] = Date::parse($data['due_at'])->utc();
                $data['due_date'] = null;
            }

            // Пустой документ (только пустые абзацы) — это «нет описания»
            if (is_array($data['description'] ?? null) && (new RichTextDocument($data['description']))->isEmpty()) {
                $data['description'] = null;
            }

            $card->fill($data);
            $fields = array_keys($card->getDirty());

            if ($fields === []) {
                return $card;
            }

            sort($fields);
            $payload = ['fields' => $fields];
            foreach (self::TRACKED as $field) {
                if ($card->isDirty($field)) {
                    $payload['changes'][$field] = [
                        'from' => $this->snapshot($field, $card->getOriginal($field)),
                        'to' => $this->snapshot($field, $card->getAttribute($field)),
                    ];
                }
            }

            $card->save();
            $this->events->record(EventType::CardUpdated, $actor, $card, $payload);

            if ($card->wasChanged('description')) {
                $mentioned = $card->description === null ? [] : (new RichTextDocument($card->description))->mentionedUserIds();
                $this->mentions->sync($card, MentionSync::SOURCE_CARD, $card->id, $mentioned, $actor);
            }

            if ($card->wasChanged(['customer_id', 'responsible_id'])) {
                $this->people->keepAccess($card, $actor);
            }

            return $card;
        });
    }

    /** Значение поля для журнала: дата — Y-m-d, момент — ISO 8601 UTC, оценка — число. */
    private function snapshot(string $field, mixed $value): mixed
    {
        return match (true) {
            $value === null => null,
            $field === 'due_date' && $value instanceof CarbonInterface => $value->toDateString(),
            $value instanceof CarbonInterface => $value->toIso8601ZuluString(),
            $field === 'estimate_hours' => (float) $value,
            default => $value,
        };
    }
}
