<?php

namespace App\Actions\PmStand;

use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\SyncCardLabelsAction;
use App\Actions\Cards\UpdateCardAction;
use App\Models\Card;
use App\Models\User;
use App\Services\PmStand\PmStand;
use App\Support\RichText\RichTextBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Карточка работы на доске «Бэклог» (колонка «Взято в работу») от имени QA-бота — для работы, у которой нет
 * карточки на стенде: инфраструктура, хотфикс, подэтап (CLAUDE.md, раздел о процессе). Описание — простая
 * разметка, как у комментария; метку подэтапа, если её ещё нет, заводит PM. Карточка с тем же названием на
 * «Бэклоге» уже есть — возвращается она (повторный запуск ничего не дублирует).
 */
class ReportTaskAction
{
    public function __construct(
        private readonly CreateCardAction $createCard,
        private readonly UpdateCardAction $updateCard,
        private readonly SyncCardLabelsAction $syncLabels,
        private readonly EnsureLabelAction $ensureLabel,
    ) {}

    /**
     * @param  array{title: string, description: string, substage?: string|null}  $task
     * @return array{card: Card, created: bool}
     */
    public function handle(User $bot, User $owner, array $task): array
    {
        $space = PmStand::requireSpace();
        $board = PmStand::requireBoard($space, PmStand::BACKLOG_BOARD);

        $existing = Card::withTrashed()->where('board_id', $board->id)->where('title', $task['title'])->first();
        if ($existing !== null) {
            return ['card' => $existing, 'created' => false];
        }

        $column = PmStand::requireColumn($board, PmStand::TASK_COLUMN);

        return DB::transaction(function () use ($bot, $owner, $task, $space, $board, $column) {
            $card = $this->createCard->handle($bot, $board, ['title' => $task['title']], $column, PmStand::lane($board));
            $this->updateCard->handle($bot, $card, ['description' => RichTextBuilder::fromMarkdown($task['description'])]);

            if (($task['substage'] ?? null) !== null) {
                $label = $this->ensureLabel->handle($owner, $space, $task['substage'], PmStand::SUBSTAGE_LABEL_COLOR);
                $this->syncLabels->handle($bot, $card, [$label->id]);
            }

            return ['card' => $card, 'created' => true];
        });
    }
}
