<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * «Права 2.0», П2d-1 (docs/adr/0024-rights-2.md): несколько ролей у субъекта на одном узле дерева. Временные уникальные
 * индексы П2a «одна роль у пользователя (группы) на узле» снимаются; остаётся уникальность «узел × субъект × роль»
 * (access_grants_user_role_unique, access_grants_group_role_unique). Выдачи на папки схема допускала и раньше (узел —
 * любой узел дерева; гостю — только пространства, триггер П2c), наследование вычисляет AccessResolver.
 *
 * down() возвращает временные индексы, а если у кого-то уже несколько ролей на одном узле — отказывает с объяснением:
 * снять лишние роли молча значило бы потерять выдачи (откат — только из бэкапа).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('DROP INDEX access_grants_one_role_user');
        DB::statement('DROP INDEX access_grants_one_role_group');
    }

    public function down(): void
    {
        $repeated = DB::query()->fromSub(DB::table('access_grants')
            ->select(['nav_node_id', 'user_id', 'group_id'])
            ->groupBy(['nav_node_id', 'user_id', 'group_id'])
            ->havingRaw('count(*) > 1'), 'repeated')->count();

        if ($repeated > 0) {
            throw new RuntimeException(
                "Откат П2d-1 невозможен без потери данных — несколько ролей у субъекта на одном узле: {$repeated}. "
                .'Прежняя схема (одна роль) их не выражает. Откат — только из бэкапа (make restore / make pm-restore).'
            );
        }

        DB::statement('CREATE UNIQUE INDEX access_grants_one_role_user ON access_grants (nav_node_id, user_id) WHERE user_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX access_grants_one_role_group ON access_grants (nav_node_id, group_id) WHERE group_id IS NOT NULL');
    }
};
