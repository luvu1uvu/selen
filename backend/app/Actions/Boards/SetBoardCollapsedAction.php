<?php

namespace App\Actions\Boards;

use App\Models\Board;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Свернуть или развернуть доску у себя на странице пространства (ADR-0019). Это личный вид, а не изменение данных: у
 * каждого пользователя своя строка, другие его не видят; карточки, счётчики и метрики её не читают; в журнал событий
 * не пишется (как свёрнутые дорожки и раскрытые папки дерева). Повтор безопасен.
 */
class SetBoardCollapsedAction
{
    public function handle(User $user, Board $board, bool $collapsed): void
    {
        if ($collapsed) {
            // ON CONFLICT DO NOTHING: два одновременных запроса не столкнутся на первичном ключе
            DB::table('collapsed_boards')->insertOrIgnore(['user_id' => $user->id, 'board_id' => $board->id]);

            return;
        }

        $user->collapsedBoards()->detach($board->id);
    }
}
