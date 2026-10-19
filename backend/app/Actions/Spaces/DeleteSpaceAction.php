<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\Label;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\SpaceGroup;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Удаление пространства навсегда (LATER-43, ADR-0013 «Изменения»): только пространства, в котором никогда не было
 * карточек — ни активных, ни архивных, ни удалённых в корзину (LATER-45, ADR-0015: история карточек нужна метрикам,
 * карточки физически не удаляются). Вместе с ним удаляется его пустая структура: доски (и архивные) с колонками
 * и дорожками, участники, доступы групп, метки пространства, узел дерева. Записи журнала событий остаются
 * (append-only, ADR-0003).
 */
class DeleteSpaceAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Space $space): void
    {
        DB::transaction(function () use ($actor, $space) {
            NavNode::lockTree();
            $space = Space::query()->lockForUpdate()->findOrFail($space->id);

            $cards = Card::query()->withTrashed()->where('space_id', $space->id)->count();
            if ($cards > 0) {
                throw ValidationException::withMessages(['space' => __('selen.spaces.delete_has_cards', ['count' => $cards])]);
            }

            $boardIds = Board::query()->where('space_id', $space->id)->pluck('id')->all();
            $this->events->record(EventType::SpaceDeleted, $actor, $space, ['board_ids' => $boardIds]);

            // От зависимых к основным: внешние ключи — RESTRICT. Подколонки — раньше колонок первого уровня
            BoardColumn::query()->whereIn('board_id', $boardIds)->whereNotNull('parent_id')->delete();
            BoardColumn::query()->whereIn('board_id', $boardIds)->delete();
            Lane::query()->whereIn('board_id', $boardIds)->delete();
            Board::query()->whereKey($boardIds)->delete();
            Label::query()->where('space_id', $space->id)->delete();
            SpaceGroup::query()->where('space_id', $space->id)->delete();
            SpaceMember::query()->where('space_id', $space->id)->delete();
            NavNode::query()->where('space_id', $space->id)->delete();
            $space->delete();
        });
    }
}
