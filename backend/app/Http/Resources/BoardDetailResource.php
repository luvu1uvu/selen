<?php

namespace App\Http\Resources;

use App\Enums\ColumnCategory;
use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardType;
use App\Models\Label;
use App\Models\Lane;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * Доска целиком для отрисовки: колонки (первый уровень, за каждым — его подколонки), дорожки,
 * видимые пользователю активные карточки в компактном виде (фасад) и справочники: типы, метки и люди
 * с фасадов. Ожидает загруженные space, columns, lanes, cards.labels, cards.responsible и счётчики cards
 * (checklist_total, checklist_done, comments_count, attachments_count, is_blocked).
 *
 * @mixin Board
 */
class BoardDetailResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();
        $space = $this->space;
        $topLevel = $this->columns->whereNull('parent_id')->sortBy('position', SORT_STRING)->values();
        $children = $this->columns->whereNotNull('parent_id')->sortBy('position', SORT_STRING)->groupBy('parent_id');

        $columns = [];
        foreach ($topLevel as $column) {
            $columns[] = $this->column($column, $column->category);
            foreach ($children->get($column->id, []) as $child) {
                $columns[] = $this->column($child, $column->category);
            }
        }

        $editCards = Gate::forUser($user)->allows('createCard', $this->resource);
        $access = $space->accessOf($user);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'archived_at' => $this->archived_at?->toIso8601ZuluString(),
            'auto_assign_on_move' => $this->auto_assign_on_move,
            'space' => ['id' => $space->id, 'key' => $space->key, 'name' => $space->name],
            'permissions' => [
                'manage' => Gate::forUser($user)->allows('manage', $this->resource),
                'edit_cards' => $editCards,
                // Удалять карточки в корзину — только системный администратор (ADR-0015)
                'delete_cards' => Gate::forUser($user)->allows('deleteCards', $this->resource),
            ],
            // Без колонки «готово» метрики lead/cycle time по доске не посчитаются
            'has_done_column' => $topLevel->contains(fn (BoardColumn $c) => $c->category === ColumnCategory::Done),
            'columns' => $columns,
            'lanes' => $this->lanes->sortBy('position', SORT_STRING)->values()->map(fn (Lane $lane) => [
                'id' => $lane->id,
                'name' => $lane->name,
                'position' => $lane->position,
            ]),
            'cards' => $this->cards->sortBy('position', SORT_STRING)->values()->map(fn (Card $card) => [
                'id' => $card->id,
                'key' => $space->key.'-'.$card->number,
                'title' => $card->title,
                'column_id' => $card->column_id,
                'lane_id' => $card->lane_id,
                'position' => $card->position,
                'card_type_id' => $card->card_type_id,
                'label_ids' => $card->labels->sortBy(fn (Label $l) => [$l->space_id !== null, mb_strtolower($l->name)])->pluck('id')->values(),
                'responsible_id' => $card->responsible_id,
                'due_date' => $card->due_date?->toDateString(),
                'due_at' => $card->due_at?->toIso8601ZuluString(),
                'completed_at' => $card->completed_at?->toIso8601ZuluString(),
                'is_urgent' => $card->is_urgent,
                // Прогресс чек-листов (null — чек-листов нет) и счётчики содержимого
                'checklist' => $card->checklist_total > 0 ? ['done' => (int) $card->checklist_done, 'total' => (int) $card->checklist_total] : null,
                'comments_count' => (int) $card->comments_count,
                'attachments_count' => (int) $card->attachments_count,
                // Есть активная блокировка — карточка выделяется на доске (ADR-0011)
                'is_blocked' => (bool) $card->is_blocked,
                // Можно ли менять и перемещать: при источнике с «только своими» — только свои (ADR-0012)
                'can_edit' => $editCards && $access->allowsOnCard(
                    fn (SpaceRole $role) => $role->canEditCards(),
                    fn () => $card->customer_id === $user->id || $card->responsible_id === $user->id || (bool) $card->getAttribute('viewer_is_participant'),
                ),
            ]),
            'card_types' => CardTypeResource::collection(CardType::query()->ordered()->get()),
            // Справочники для фасадов: метки и ответственные, которые встречаются на карточках доски
            'labels' => LabelResource::collection($this->cards->flatMap->labels->unique('id')->values()),
            'people' => $this->cards->pluck('responsible')->filter()->unique('id')->values()->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'status' => $u->status,
            ]),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function column(BoardColumn $column, ?ColumnCategory $category): array
    {
        return [
            'id' => $column->id,
            'parent_id' => $column->parent_id,
            'name' => $column->name,
            'category' => $category,
            'position' => $column->position,
        ];
    }
}
