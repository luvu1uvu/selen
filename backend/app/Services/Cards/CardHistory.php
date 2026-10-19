<?php

namespace App\Services\Cards;

use App\Enums\EventType;
use App\Http\Resources\CardTransitionResource;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardTransition;
use App\Models\CardType;
use App\Models\EventLogEntry;
use App\Models\Label;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;

/**
 * Лента истории карточки: переходы (card_transitions) и события журнала по карточке — от новых к старым.
 *
 * Перемещения берутся только из card_transitions: события card.created, card.moved и card.reordered
 * их дублируют и в ленту не попадают. Журнал хранит только идентификаторы (ADR-0003), поэтому к ленте
 * прикладываются справочники: люди, метки, типы, тексты причин блокировок и связанные карточки.
 * Связанная карточка, которую зритель не видит (ADR-0008), в payload заменяется на «hidden» и в справочник
 * не попадает — «Скрытая карточка» без номера и названия. Карточка в корзине — «deleted» («Удалённая карточка»).
 */
class CardHistory
{
    /** Ключ payload, где лежит id связанной карточки. */
    private const CARD_REFS = ['card_id', 'blocking_card_id'];

    /** Маркер скрытой карточки в payload. */
    public const HIDDEN = 'hidden';

    /** Маркер карточки в корзине (ADR-0015). */
    public const DELETED = 'deleted';

    private const SKIPPED = [EventType::CardCreated, EventType::CardMoved, EventType::CardReordered];

    public function __construct(private readonly CardVisibility $visibility) {}

    /**
     * @return array{data: list<array<string, mixed>>, refs: array<string, object>}
     */
    public function for(User $viewer, Card $card, Request $request): array
    {
        $transitions = $card->transitions()
            ->with(['actor:id,name', 'fromBoard', 'toBoard', 'fromColumn', 'toColumn', 'fromLane', 'toLane'])
            ->get();
        $events = EventLogEntry::query()
            ->where('subject_type', $card->getMorphClass())
            ->where('subject_id', $card->id)
            ->whereNotIn('event_type', array_map(fn (EventType $type) => $type->value, self::SKIPPED))
            ->with('actor:id,name')
            ->orderBy('id')
            ->get();

        $cards = $this->relatedCards($viewer, $card, $events);

        $items = $transitions->map(fn (CardTransition $t) => [
            'id' => 't'.$t->id,
            'kind' => 'transition',
            'at' => $t->moved_at->format('Y-m-d\TH:i:s.u\Z'),
            'transition' => (new CardTransitionResource($t))->toArray($request),
        ])->concat($events->map(fn (EventLogEntry $e) => [
            'id' => 'e'.$e->id,
            'kind' => 'event',
            'at' => $e->occurred_at->format('Y-m-d\TH:i:s.u\Z'),
            'actor' => $e->actor === null ? null : ['id' => $e->actor->id, 'name' => $e->actor->name],
            'event_type' => $e->event_type,
            'payload' => $this->mask($e->payload, $cards),
        ]))->all();

        // Новые сверху. В одно мгновение событие идёт после перехода (автоназначение — следствие перемещения),
        // поэтому выше него; внутри вида — по порядку записи
        usort($items, fn (array $a, array $b) => [$b['at'], $a['kind'], (int) substr($b['id'], 1)]
            <=> [$a['at'], $b['kind'], (int) substr($a['id'], 1)]);

        return ['data' => $items, 'refs' => $this->refs($events, $cards)];
    }

    /**
     * Связанные карточки из payload — глазами зрителя.
     *
     * @param  Collection<int, EventLogEntry>  $events
     * @return array<string, array<string, mixed>>
     */
    private function relatedCards(User $viewer, Card $card, Collection $events): array
    {
        $ids = $events->flatMap(fn (EventLogEntry $e) => Arr::only($e->payload, self::CARD_REFS))->filter()->unique()->values();

        return Card::query()->withTrashed()->whereIn('id', $ids)->with(['column.parent', 'participants:id'])->get()
            // Все связанные карточки — из пространства этой карточки: кеш роли зрителя общий
            ->each(fn (Card $related) => $related->setRelation('space', $card->space))
            ->mapWithKeys(fn (Card $related) => [$related->id => $this->visibility->present($viewer, $related)])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, array<string, mixed>>  $cards
     * @return array<string, mixed>
     */
    private function mask(array $payload, array $cards): array
    {
        foreach (self::CARD_REFS as $key) {
            $id = $payload[$key] ?? null;
            if (is_string($id) && ($cards[$id]['hidden'] ?? true)) {
                $payload[$key] = ($cards[$id]['deleted'] ?? false) ? self::DELETED : self::HIDDEN;
            }
        }

        return $payload;
    }

    /**
     * Справочники для подписей: id → имя (люди, типы), метки с цветом, тексты причин блокировок, карточки.
     *
     * @param  Collection<int, EventLogEntry>  $events
     * @param  array<string, array<string, mixed>>  $cards
     * @return array<string, object>
     */
    private function refs(Collection $events, array $cards): array
    {
        $payloads = $events->pluck('payload');
        $changes = fn (string $field) => $payloads->flatMap(fn (array $p) => array_values($p['changes'][$field] ?? []));

        $userIds = $payloads->pluck('user_id')->concat($changes('customer_id'))->concat($changes('responsible_id'));
        $labelIds = $payloads->flatMap(fn (array $p) => [...($p['added'] ?? []), ...($p['removed'] ?? [])]);
        $blockIds = $payloads->pluck('block_id');

        return [
            'users' => (object) User::query()->whereIn('id', $userIds->filter()->unique())->pluck('name', 'id')->all(),
            'card_types' => (object) CardType::query()->whereIn('id', $changes('card_type_id')->filter()->unique())->pluck('name', 'id')->all(),
            'labels' => (object) Label::query()->whereIn('id', $labelIds->filter()->unique())->get(['id', 'name', 'color'])
                ->mapWithKeys(fn (Label $l) => [$l->id => ['name' => $l->name, 'color' => $l->color]])->all(),
            'blocks' => (object) CardBlock::query()->whereIn('id', $blockIds->filter()->unique())->pluck('reason', 'id')->all(),
            'cards' => (object) array_filter($cards, fn (array $c) => ! $c['hidden']),
        ];
    }
}
