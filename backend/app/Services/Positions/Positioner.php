<?php

namespace App\Services\Positions;

use App\Support\FractionalIndex;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Позиция элемента в упорядоченном списке (карточки ячейки, колонки, дорожки, доски) — docs/adr/0007-positions.md.
 *
 * Клиент сообщает соседей, которых видел: after_id (элемент выше/левее) и before_id (ниже/правее).
 * Сервер берёт after_id, если он всё ещё в этом списке, иначе before_id, иначе ставит в конец;
 * второго соседа читает из БД сам. Поэтому запрос по устаревшим данным не ломает порядок.
 */
class Positioner
{
    /**
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $siblings  соседи по списку — без перемещаемого элемента
     */
    public function place(Builder $siblings, ?string $afterId = null, ?string $beforeId = null): string
    {
        if ($afterId !== null) {
            $after = (clone $siblings)->whereKey($afterId)->value('position');
            if ($after !== null) {
                $next = (clone $siblings)->where('position', '>', $after)->orderBy('position')->value('position');

                return FractionalIndex::between($after, $next);
            }
        }

        if ($beforeId !== null) {
            $before = (clone $siblings)->whereKey($beforeId)->value('position');
            if ($before !== null) {
                $previous = (clone $siblings)->where('position', '<', $before)->orderByDesc('position')->value('position');

                return FractionalIndex::between($previous, $before);
            }
        }

        return $this->atEnd($siblings);
    }

    /**
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $siblings
     */
    public function atEnd(Builder $siblings): string
    {
        return FractionalIndex::between((clone $siblings)->orderByDesc('position')->value('position'), null);
    }

    /**
     * Сериализовать вставки в одну ячейку доски до конца транзакции: без этого два параллельных
     * запроса могли бы вычислить одинаковый ключ между теми же соседями.
     */
    public function lockCell(string $columnId, string $laneId): void
    {
        DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ["cards:{$columnId}:{$laneId}"]);
    }
}
