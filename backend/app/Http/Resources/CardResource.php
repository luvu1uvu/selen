<?php

namespace App\Http\Resources;

use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardLink;
use App\Models\CardRelation;
use App\Models\Checklist;
use App\Models\ChecklistItem;
use App\Models\Label;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use App\Services\Metrics\CardFlowMetrics;
use App\Support\RichText\MentionedUsers;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * Карточка целиком (окно карточки). Ожидает загруженное Card::loadDetails().
 *
 * @mixin Card
 */
class CardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();
        $times = app(CardFlowMetrics::class)->forCard($this->resource);
        // Исключённые из пространства остаются на карточке с пометкой (роль — только через roleOf)
        $person = fn (?User $person) => $person === null ? null : [
            'id' => $person->id,
            'name' => $person->name,
            'status' => $person->status,
            'in_space' => $this->space->roleOf($person) !== null,
        ];

        // Связанные и блокирующие карточки — глазами зрителя: невидимая — «Скрытая карточка» (ADR-0008)
        $visibility = app(CardVisibility::class);
        $present = fn (Card $card) => $visibility->present($user, $card->setRelation('space', $this->space));
        $relation = fn (CardRelation $relation) => ['id' => $relation->id, 'card' => $present($relation->otherThan($this->resource))];
        $children = $this->childRelations->map(fn (CardRelation $r) => $r->child)->reject(fn (Card $c) => $c->isArchived() || $c->trashed());

        return [
            'id' => $this->id,
            'key' => $this->key(),
            'number' => $this->number,
            'title' => $this->title,
            'description' => $this->description,
            // Имена упомянутых в описании (в документе — только id)
            'mentioned_users' => (object) MentionedUsers::names([$this->description]),
            'space' => ['id' => $this->space->id, 'key' => $this->space->key, 'name' => $this->space->name],
            'board' => ['id' => $this->board->id, 'name' => $this->board->name],
            'column' => [
                'id' => $this->column->id,
                'name' => $this->column->name,
                'parent_name' => $this->column->parent?->name,
                'category' => $this->column->effectiveCategory(),
            ],
            'lane' => ['id' => $this->lane->id, 'name' => $this->lane->name],
            'card_type' => new CardTypeResource($this->type),
            'created_by' => ['id' => $this->creator->id, 'name' => $this->creator->name],
            'customer' => $person($this->customer),
            'responsible' => $person($this->responsible),
            'participants' => $this->participants->sortBy(fn (User $u) => mb_strtolower($u->name))->values()->map($person),
            'labels' => LabelResource::collection($this->labels->sortBy(fn (Label $l) => [$l->space_id !== null, mb_strtolower($l->name)])->values()),
            // Срок: либо дата без времени, либо момент (UTC)
            'due_date' => $this->due_date?->toDateString(),
            'due_at' => $this->due_at?->toIso8601ZuluString(),
            'is_urgent' => $this->is_urgent,
            'estimate_hours' => $this->estimate_hours === null ? null : (float) $this->estimate_hours,
            'checklists' => $this->checklists->map(fn (Checklist $checklist) => [
                'id' => $checklist->id,
                'title' => $checklist->title,
                'items' => $checklist->items->map(fn (ChecklistItem $item) => [
                    'id' => $item->id,
                    'text' => $item->text,
                    'is_done' => $item->is_done,
                ]),
            ]),
            'links' => $this->links->map(fn (CardLink $link) => [
                'id' => $link->id,
                'url' => $link->url,
                'title' => $link->title,
            ]),
            'relations' => [
                'parents' => $this->parentRelations->map($relation),
                'children' => $this->childRelations->map($relation),
                // Прогресс родителя: дочерние в «готово» из всех активных (включая скрытые от зрителя, без корзины)
                'progress' => $children->isEmpty() ? null : [
                    'done' => $children->filter(fn (Card $c) => $c->completed_at !== null)->count(),
                    'total' => $children->count(),
                ],
            ],
            // Эпизоды блокировки, новые сверху: активные (ended_at = null) и история (ADR-0011)
            'blocks' => $this->blocks->map(fn (CardBlock $block) => [
                'id' => $block->id,
                'reason' => $block->reason,
                'blocking_card' => $block->blockingCard === null ? null : $present($block->blockingCard),
                'started_at' => $block->started_at->toIso8601ZuluString(),
                'started_by' => ['id' => $block->starter->id, 'name' => $block->starter->name],
                'ended_at' => $block->ended_at?->toIso8601ZuluString(),
                'ended_by' => $block->ender === null ? null : ['id' => $block->ender->id, 'name' => $block->ender->name],
                'end_reason' => $block->end_reason,
            ]),
            'attachments' => AttachmentResource::collection($this->attachments->each->setRelation('card', $this->resource)),
            'created_at' => $this->created_at->format('Y-m-d\TH:i:s.u\Z'),
            'first_started_at' => $this->first_started_at?->format('Y-m-d\TH:i:s.u\Z'),
            'completed_at' => $this->completed_at?->format('Y-m-d\TH:i:s.u\Z'),
            // Последнее перемещение пользователем в другое место (окно карточки: «Перемещена N назад»); null — не перемещали
            'moved_at' => $times->movedAt?->format('Y-m-d\TH:i:s.u\Z'),
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            // Считаются по card_transitions (CardFlowMetrics), секунды; null — не завершена
            'metrics' => [
                'lead_time_seconds' => $times->leadTimeSeconds(),
                'cycle_time_seconds' => $times->cycleTimeSeconds(),
            ],
            'permissions' => [
                'edit' => Gate::forUser($user)->allows('update', $this->resource),
                // Комментировать и прикладывать файлы — все роли, включая commenter
                'comment' => Gate::forUser($user)->allows('comment', $this->resource),
                // В корзину — только системный администратор (ADR-0015)
                'delete' => Gate::forUser($user)->allows('delete', $this->resource),
                // Для зрителя действует режим «только свои карточки» (ADR-0008)
                'restricted' => app(CardVisibility::class)->isRestricted($user, $this->space),
            ],
        ];
    }
}
