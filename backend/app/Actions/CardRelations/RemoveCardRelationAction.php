<?php

namespace App\Actions\CardRelations;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\CardRelation;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Убрать связь со стороны карточки $card. Связь со скрытой для пользователя карточкой он не убирает:
 * он не знает, что это за карточка (ADR-0008).
 */
class RemoveCardRelationAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly CardVisibility $visibility,
    ) {}

    public function handle(User $actor, Card $card, CardRelation $relation): void
    {
        DB::transaction(function () use ($actor, $card, $relation) {
            $this->guard->ensureNotArchived($card);

            if (! $this->visibility->canSee($actor, $relation->otherThan($card))) {
                throw ValidationException::withMessages(['relation' => __('selen.relations.hidden')]);
            }

            $relation->delete();

            $this->events->record(EventType::CardRelationRemoved, $actor, $relation->parent, [
                'relation_id' => $relation->id, 'kind' => AddCardRelationAction::KIND_CHILD, 'card_id' => $relation->child_id,
            ]);
            $this->events->record(EventType::CardRelationRemoved, $actor, $relation->child, [
                'relation_id' => $relation->id, 'kind' => AddCardRelationAction::KIND_PARENT, 'card_id' => $relation->parent_id,
            ]);
        });
    }
}
