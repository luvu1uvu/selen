<?php

namespace Database\Seeders;

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Boards\MoveBoardAction;
use App\Actions\Boards\SetBoardCollapsedAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Enums\BoardTemplate;
use App\Enums\ColumnCategory;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Lane;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Пространство для замера производительности страницы пространства (make perf, e2e/perf/space.perf.ts; ADR-0019,
 * журнал пакета «Раскладка», раздел 5). Только на стеке замера, после DemoSeeder и BoardsDemoSeeder (нужны
 * admin@selen.test и anna@selen.test).
 *
 * PERF «Производительность», администратор — anna: 5 досок по 200 карточек, разложенных по колонкам поровну, ряды
 * [«Узкая» (2 колонки), «Широкая 1» (8)], [«Широкая 2» (8)], [«Средняя 1» (4), «Средняя 2» (4)]. «Средняя 2» у anna
 * свёрнута — её карточки страница загружать не должна.
 */
class PerfSpaceSeeder extends Seeder
{
    private const CARDS = 200;

    public function run(): void
    {
        $admin = User::query()->where('email', 'admin@selen.test')->sole();
        $anna = User::query()->where('email', 'anna@selen.test')->sole();
        $space = app(CreateSpaceAction::class)->handle($admin, ['name' => 'Производительность', 'key' => 'PERF'], [$anna]);
        $create = app(CreateBoardAction::class);
        $move = app(MoveBoardAction::class);

        $narrow = $create->handle($anna, $space, ['name' => 'Узкая'], BoardTemplate::Empty);
        $now = app(CreateColumnAction::class)->handle($anna, $narrow, 'В работе', ColumnCategory::InProgress, null, null, null);
        app(CreateColumnAction::class)->handle($anna, $narrow, 'Готово', ColumnCategory::Done, null, $now->id, null);
        $wide1 = $create->handle($anna, $space, ['name' => 'Широкая 1'], BoardTemplate::Development);
        $wide2 = $create->handle($anna, $space, ['name' => 'Широкая 2'], BoardTemplate::Development);
        $medium1 = $create->handle($anna, $space, ['name' => 'Средняя 1'], BoardTemplate::Simple);
        $medium2 = $create->handle($anna, $space, ['name' => 'Средняя 2'], BoardTemplate::Simple);

        foreach ([$narrow, $wide1, $wide2, $medium1, $medium2] as $board) {
            $this->fill($anna, $board);
        }

        $move->handle($anna, $wide1, $narrow->id, null, rowId: $narrow->row_id);
        $move->handle($anna, $medium2, $medium1->id, null, rowId: $medium1->row_id);
        app(SetBoardCollapsedAction::class)->handle($anna, $medium2, true);

        $this->command->info('Пространство PERF: 5 досок по '.self::CARDS.' карточек рядами; «Средняя 2» у anna свёрнута.');
    }

    /** Карточки поровну по колонкам доски: высота колонок близка к настоящей доске с потоком задач. */
    private function fill(User $actor, Board $board): void
    {
        $columns = BoardColumn::query()->where('board_id', $board->id)->whereNull('archived_at')->orderBy('position')->get()->all();
        $lane = Lane::query()->where('board_id', $board->id)->sole();
        $create = app(CreateCardAction::class);
        foreach (range(1, self::CARDS) as $i) {
            $create->handle($actor, $board, ['title' => "{$board->name}: задача {$i}"], $columns[$i % count($columns)], $lane);
        }
    }
}
