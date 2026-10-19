<?php

namespace App\Actions\Lanes;

use App\Models\Lane;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Свернуть или развернуть дорожку у себя (ADR-0019). Это личный вид, а не изменение данных: у каждого пользователя
 * своя строка, другие его не видят; счётчики, выборки карточек и метрики её не читают; в журнал событий не пишется
 * (как раскрытые папки дерева). Повтор безопасен: свёрнутую — свернуть, развёрнутую — развернуть.
 */
class SetLaneCollapsedAction
{
    public function handle(User $user, Lane $lane, bool $collapsed): void
    {
        if ($collapsed) {
            // ON CONFLICT DO NOTHING: два одновременных запроса не столкнутся на первичном ключе
            DB::table('collapsed_lanes')->insertOrIgnore(['user_id' => $user->id, 'lane_id' => $lane->id]);

            return;
        }

        $user->collapsedLanes()->detach($lane->id);
    }
}
