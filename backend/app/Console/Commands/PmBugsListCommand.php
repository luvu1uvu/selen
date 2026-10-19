<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Models\Card;
use App\Models\Label;
use App\Services\Cards\CardVisibility;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;

/**
 * Стенд PM (make pm-bugs-list): карточки доски «Баги приёмки» в колонке (по умолчанию «Новый») — номер,
 * название, метки. Выборка — как для QA-бота (CardVisibility).
 */
#[Signature('pm:bugs-list {--bot= : Email QA-бота} {--column=Новый : Колонка доски «Баги приёмки»}')]
#[Description('Стенд PM: баги в колонке доски «Баги приёмки»')]
class PmBugsListCommand extends Command
{
    use ReportsStandErrors;

    public function handle(CardVisibility $visibility): int
    {
        return $this->reportingErrors(function () use ($visibility) {
            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $space = PmStand::requireSpace();
            $board = PmStand::requireBoard($space, PmStand::BUGS_BOARD);
            $column = PmStand::requireColumn($board, (string) $this->option('column'));
            Gate::forUser($bot)->authorize('view', $board);

            $cards = $visibility->scope(Card::query(), $bot, $space)
                ->where('board_id', $board->id)->where('column_id', $column->id)->whereNull('archived_at')
                ->with(['space', 'labels'])->orderBy('position')->get();

            if ($cards->isEmpty()) {
                $this->line("В колонке «{$column->name}» багов нет.");

                return self::SUCCESS;
            }

            $this->line("«{$column->name}» — {$cards->count()}:");
            foreach ($cards as $card) {
                $labels = $card->labels->map(fn (Label $l) => $l->name)->implode(', ');
                $this->line(sprintf('  %-10s %s%s', $card->key(), $card->title, $labels !== '' ? " [{$labels}]" : ''));
            }

            return self::SUCCESS;
        });
    }
}
