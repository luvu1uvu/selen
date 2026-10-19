<?php

namespace App\Actions\PmStand;

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Boards\UpdateBoardAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Enums\BoardTemplate;
use App\Enums\ColumnCategory;
use App\Models\Board;
use App\Models\Space;
use App\Models\User;
use App\Services\PmStand\PmStand;
use Illuminate\Support\Facades\DB;

/**
 * Пространство LATER стенда PM: метки (в том числе «UX» — она доступна на обеих досках) и доски «Бэклог» и
 * «Баги приёмки» с колонками и шаблоном бага в описании. Недостающее создаётся
 * от имени PM (единственный администратор пространства), существующее не меняется — PM мог его переименовать
 * или дополнить, поэтому повторный запуск безопасен.
 */
class SetUpPmSpaceAction
{
    public function __construct(
        private readonly CreateSpaceAction $createSpace,
        private readonly CreateBoardAction $createBoard,
        private readonly UpdateBoardAction $updateBoard,
        private readonly CreateColumnAction $createColumn,
        private readonly EnsureLabelAction $ensureLabel,
    ) {}

    public function handle(User $owner): Space
    {
        return DB::transaction(function () use ($owner) {
            $space = PmStand::space() ?? $this->createSpace->handle($owner, [
                'name' => PmStand::SPACE_NAME,
                'key' => PmStand::SPACE_KEY,
                'description' => 'Отложенные задачи и баги приёмки PM.',
            ], [$owner], '⏳');

            foreach (PmStand::LABELS as $name => $color) {
                $this->ensureLabel->handle($owner, $space, $name, $color);
            }

            $this->ensureBoard($owner, $space, PmStand::BACKLOG_BOARD, PmStand::BACKLOG_COLUMNS);
            // Баг в «Исправляется» переводит QA-бот, а исправляет не он — автоназначение на доске багов выключено
            $bugs = $this->ensureBoard($owner, $space, PmStand::BUGS_BOARD, PmStand::BUGS_COLUMNS, autoAssign: false);
            // Шаблон бага для PM — только если описания ещё нет (на уже работающем стенде тоже)
            if (trim((string) $bugs->description) === '') {
                $this->updateBoard->handle($owner, $bugs, ['description' => PmStand::BUGS_BOARD_DESCRIPTION]);
            }

            return $space;
        });
    }

    /**
     * @param  array<string, ColumnCategory>  $columns
     */
    private function ensureBoard(User $owner, Space $space, string $name, array $columns, bool $autoAssign = true): Board
    {
        $board = PmStand::board($space, $name);
        if ($board === null) {
            $board = $this->createBoard->handle($owner, $space, ['name' => $name], BoardTemplate::Empty);
            $this->updateBoard->handle($owner, $board, ['auto_assign_on_move' => $autoAssign]);
        }

        foreach ($columns as $column => $category) {
            if (PmStand::column($board, $column) === null) {
                $this->createColumn->handle($owner, $board, $column, $category, null, null, null);
            }
        }

        return $board;
    }
}
