<?php

namespace App\Console\Commands;

use App\Actions\Comments\AddCommentAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Services\PmStand\PmStand;
use App\Support\RichText\RichTextBuilder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Стенд PM (make pm-bug-comment): комментарий к карточке LATER от имени QA-бота. Текст — из --text или файла
 * --file (для длинных: причина, исправление, ссылка на PR, тест-кейс). Разметка: «## » — заголовок, «1. » и «- » —
 * списки, адреса http(s) — ссылки.
 */
#[Signature('pm:bug-comment {card : Номер карточки, например LATER-12} {--bot= : Email QA-бота} {--text= : Текст комментария} {--file= : Файл с текстом комментария}')]
#[Description('Стенд PM: комментарий к карточке-багу от имени QA-бота')]
class PmBugCommentCommand extends Command
{
    use ReportsStandErrors;

    private const MAX_LENGTH = 20_000;

    public function handle(AddCommentAction $action): int
    {
        return $this->reportingErrors(function () use ($action) {
            $text = $this->text();
            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $card = PmStand::requireCard((string) $this->argument('card'));
            Gate::forUser($bot)->authorize('comment', $card);

            $action->handle($bot, $card, RichTextBuilder::fromMarkdown($text));
            $this->components->info("Комментарий добавлен к {$card->key()}.");

            return self::SUCCESS;
        });
    }

    private function text(): string
    {
        $file = (string) $this->option('file');
        $text = $file !== '' ? (is_file($file) ? (string) file_get_contents($file) : null) : (string) $this->option('text');

        if ($text === null) {
            throw ValidationException::withMessages(['file' => "Нет файла с текстом комментария: {$file}."]);
        }
        if (trim($text) === '') {
            throw ValidationException::withMessages(['text' => 'Пустой комментарий: укажите TEXT=… или FILE=….']);
        }
        if (mb_strlen($text) > self::MAX_LENGTH) {
            throw ValidationException::withMessages(['text' => 'Комментарий длиннее '.self::MAX_LENGTH.' символов.']);
        }

        return $text;
    }
}
