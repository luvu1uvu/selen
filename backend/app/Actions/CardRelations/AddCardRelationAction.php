<?php

namespace App\Actions\CardRelations;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\CardRelation;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Связать карточку с другой карточкой того же пространства: $kind — кем приходится вторая карточка
 * (parent — родитель, child — дочерняя). У карточки может быть несколько родителей (как в Kaiten),
 * циклы запрещены. Событие пишется у обеих карточек — связь видна в истории каждой.
 */
class AddCardRelationAction
{
    public const KIND_PARENT = 'parent';

    public const KIND_CHILD = 'child';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly RelatedCardGuard $related,
    ) {}

    public function handle(User $actor, Card $card, ?Card $other, string $kind): CardRelation
    {
        return DB::transaction(function () use ($actor, $card, $other, $kind) {
            // Связи пространства меняются по очереди: проверка цикла видит все уже созданные связи
            Space::query()->whereKey($card->space_id)->lockForUpdate()->first();

            $this->guard->ensureNotArchived($card);
            $other = $this->related->ensureRelatable($actor, $card, $other, 'card');
            [$parent, $child] = $kind === self::KIND_PARENT ? [$other, $card] : [$card, $other];

            $exists = CardRelation::query()
                ->where(fn ($q) => $q->where('parent_id', $parent->id)->where('child_id', $child->id))
                ->orWhere(fn ($q) => $q->where('parent_id', $child->id)->where('child_id', $parent->id))
                ->exists();
            if ($exists) {
                throw ValidationException::withMessages(['card' => __('selen.relations.exists')]);
            }

            if ($this->isDescendant($parent->id, of: $child->id)) {
                throw ValidationException::withMessages(['card' => __('selen.relations.cycle')]);
            }

            $relation = new CardRelation;
            $relation->forceFill(['parent_id' => $parent->id, 'child_id' => $child->id, 'created_by' => $actor->id])->save();

            $this->events->record(EventType::CardRelationAdded, $actor, $parent, [
                'relation_id' => $relation->id, 'kind' => self::KIND_CHILD, 'card_id' => $child->id,
            ]);
            $this->events->record(EventType::CardRelationAdded, $actor, $child, [
                'relation_id' => $relation->id, 'kind' => self::KIND_PARENT, 'card_id' => $parent->id,
            ]);

            return $relation;
        });
    }

    /** Есть ли путь вниз по связям от карточки $of до $cardId (рекурсивный CTE). */
    private function isDescendant(string $cardId, string $of): bool
    {
        return DB::selectOne(<<<'SQL'
            WITH RECURSIVE descendants(id) AS (
                SELECT child_id FROM card_relations WHERE parent_id = :of
                UNION
                SELECT r.child_id FROM card_relations r JOIN descendants d ON r.parent_id = d.id
            )
            SELECT EXISTS (SELECT 1 FROM descendants WHERE id = :card) AS found
            SQL, ['of' => $of, 'card' => $cardId])->found;
    }
}
