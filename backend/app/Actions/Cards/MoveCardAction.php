<?php

namespace App\Actions\Cards;

use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\Lane;
use App\Models\User;
use App\Services\Cards\CardPeople;
use App\Services\Cards\CardPlacement;
use Illuminate\Support\Facades\DB;

/**
 * Перемещение карточки: в другую ячейку (колонка, дорожка, доска того же пространства)
 * или перестановка внутри ячейки. Что колонка и дорожка принадлежат доске пространства карточки,
 * проверяет Form Request.
 *
 * Автоназначение (настройка доски auto_assign_on_move, по умолчанию включена): после ручного перехода
 * в «в работе» или «готово» переместивший становится ответственным, а если он уже есть — участником.
 */
class MoveCardAction
{
    public function __construct(
        private readonly CardPlacement $placement,
        private readonly CardGuard $guard,
        private readonly CardPeople $people,
    ) {}

    public function handle(User $actor, Card $card, BoardColumn $column, Lane $lane, ?string $afterId, ?string $beforeId): Card
    {
        return DB::transaction(function () use ($actor, $card, $column, $lane, $afterId, $beforeId) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);
            $this->guard->ensureLeaf($column);

            $moved = $this->placement->move($card, $column, $lane, $actor, $afterId, $beforeId);

            if ($moved && $column->board->auto_assign_on_move && $column->effectiveCategory()->isStarted()) {
                $this->people->autoAssign($card, $actor);
            }

            return $card;
        });
    }
}
