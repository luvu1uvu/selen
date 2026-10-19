<?php

namespace App\Console\Commands;

use App\Actions\Cards\MoveCardAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;

/**
 * Стенд PM (make pm-bug-move): перевести карточку LATER между колонками её доски от имени QA-бота.
 * «Баги приёмки»: Новый → Исправляется → Исправлено (или «Не баг — решение PM»);
 * «Бэклог» (доработки): Идеи / без решения → Взято в работу → Сделано.
 */
#[Signature('pm:bug-move {card : Номер карточки, например LATER-12} {column : Колонка её доски, например Исправляется или «Взято в работу»} {--bot= : Email QA-бота}')]
#[Description('Стенд PM: перевести карточку LATER в другую колонку её доски')]
class PmBugMoveCommand extends Command
{
    use ReportsStandErrors;

    public function handle(MoveCardAction $move): int
    {
        return $this->reportingErrors(function () use ($move) {
            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $card = PmStand::requireCard((string) $this->argument('card'));
            Gate::forUser($bot)->authorize('update', $card);

            $column = PmStand::requireColumn($card->board, (string) $this->argument('column'));
            $move->handle($bot, $card, $column, $card->lane, null, null);

            $this->components->info("{$card->key()} → «{$column->name}».");

            return self::SUCCESS;
        });
    }
}
