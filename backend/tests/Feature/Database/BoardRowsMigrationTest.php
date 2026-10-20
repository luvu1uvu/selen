<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use Illuminate\Support\Facades\DB;

/*
| Миграция рядов досок (2026_10_23_100001_create_board_rows_table, ADR-0019): каждая существующая доска — в свой ряд
| в прежнем порядке; миграция обратима.
*/

it('раскладывает существующие доски по одной в ряд в прежнем порядке; обратима', function () {
    // Схему меняет только владелец схемы (ADR-0016); всё — в его транзакции, которая откатывается
    $connection = DB::connection('pgsql_owner');
    $connection->statement("SET lock_timeout = '3s'");
    $connection->beginTransaction();

    try {
        DB::usingConnection('pgsql_owner', function () {
            $owner = member();
            $dev = space(['key' => 'DEV']);
            $ops = space(['key' => 'OPS']);
            addToSpace($dev, $owner, SpaceRole::Admin);
            addToSpace($ops, $owner, SpaceRole::Admin);
            foreach (['Вторая' => $dev, 'Заявки' => $ops, 'Первая' => $dev, 'Третья' => $dev] as $name => $space) {
                makeBoard($space, $owner, BoardTemplate::Empty, $name);
            }
            $migration = require database_path('migrations/2026_10_23_100001_create_board_rows_table.php');

            $migration->down();
            // До рядов порядок досок пространства — boards.position
            foreach (['Первая' => 'a0', 'Вторая' => 'a1', 'Третья' => 'a2', 'Заявки' => 'a0'] as $name => $position) {
                DB::table('boards')->where('name', $name)->update(['position' => $position]);
            }

            $migration->up();
            $layout = DB::table('boards')
                ->join('board_rows', 'board_rows.id', '=', 'boards.row_id')
                ->join('spaces', 'spaces.id', '=', 'boards.space_id')
                ->where('board_rows.space_id', DB::raw('boards.space_id'))
                ->orderBy('spaces.key')->orderBy('board_rows.position')
                ->pluck('boards.name')->all();

            expect($layout)->toBe(['Первая', 'Вторая', 'Третья', 'Заявки'])
                ->and(DB::table('board_rows')->count())->toBe(4)
                ->and(DB::table('boards')->distinct()->count('row_id'))->toBe(4)
                ->and(DB::selectOne("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'boards' AND column_name = 'row_id'")->is_nullable)
                ->toBe('NO');
        });
    } finally {
        $connection->rollBack();
    }
});
