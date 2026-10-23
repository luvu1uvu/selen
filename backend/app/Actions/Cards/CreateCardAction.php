<?php

namespace App\Actions\Cards;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardType;
use App\Models\Lane;
use App\Models\User;
use App\Services\Cards\CardPlacement;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Создание карточки сразу в нужной ячейке доски.
 *
 * Номер берётся из счётчика пространства одним UPDATE ... RETURNING: строка пространства
 * блокируется до конца транзакции, поэтому параллельные создания получают разные номера по очереди.
 * Карточки не удаляются — номер не переиспользуется. UNIQUE (space_id, number) страхует в БД.
 * Заказчик новой карточки — её автор (потом можно сменить).
 */
class CreateCardAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardPlacement $placement,
        private readonly CardGuard $guard,
    ) {}

    /**
     * @param  array{title: string, card_type_id?: string|null}  $data
     */
    public function handle(
        User $actor,
        Board $board,
        array $data,
        BoardColumn $column,
        Lane $lane,
        ?string $afterId = null,
        ?string $beforeId = null,
    ): Card {
        return DB::transaction(function () use ($actor, $board, $data, $column, $lane, $afterId, $beforeId) {
            $this->guard->ensureLeaf($column);

            $number = (int) DB::selectOne(
                'UPDATE spaces SET last_card_number = last_card_number + 1 WHERE id = ? RETURNING last_card_number',
                [$board->space_id],
            )->last_card_number;

            $card = new Card([
                'title' => $data['title'],
                'card_type_id' => $data['card_type_id'] ?? CardType::default($board->companyId())->id,
            ]);
            $card->forceFill([
                'space_id' => $board->space_id,
                'number' => $number,
                'created_by' => $actor->id,
                'customer_id' => $actor->id,
            ]);

            $this->placement->create($card, $column, $lane, $actor, $afterId, $beforeId);

            $this->events->record(EventType::CardCreated, $actor, $card, [
                'number' => $number,
                'board_id' => $card->board_id,
                'column_id' => $card->column_id,
                'lane_id' => $card->lane_id,
                'card_type_id' => $card->card_type_id,
            ], $card->created_at);

            return $card;
        });
    }
}
