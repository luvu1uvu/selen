<?php

namespace App\Console\Commands;

use App\Actions\PmStand\ReportTaskAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use JsonException;

/**
 * Стенд PM (make pm-task): карточка работы на «Бэклоге» в колонке «Взято в работу» от имени QA-бота — для
 * работы без карточки на стенде (инфраструктура, хотфикс, подэтап). Формат JSON — docs/runbook.md,
 * «Стенд PM». Тест-кейсы и ссылку на PR потом добавляют комментарием (make pm-bug-comment).
 * Последняя строка вывода — номер карточки (LATER-54).
 */
#[Signature('pm:task {file : JSON с описанием работы} {--owner= : Email PM — заводит метку подэтапа, если её нет} {--bot= : Email QA-бота}')]
#[Description('Стенд PM: карточка работы на «Бэклоге» («Взято в работу») от имени QA-бота')]
class PmTaskCommand extends Command
{
    use ReportsStandErrors;

    public function handle(ReportTaskAction $action): int
    {
        return $this->reportingErrors(function () use ($action) {
            $task = $this->readTask((string) $this->argument('file'));

            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $owner = PmStand::requireUser((string) $this->option('owner'), PmStand::OWNER_HINT);
            $space = PmStand::requireSpace();
            Gate::forUser($bot)->authorize('createCard', PmStand::requireBoard($space, PmStand::BACKLOG_BOARD));
            if (($task['substage'] ?? null) !== null) {
                Gate::forUser($owner)->authorize('createLabel', $space);
            }

            ['card' => $card, 'created' => $created] = $action->handle($bot, $owner, $task);

            $created
                ? $this->components->info("Карточка заведена: {$card->key()} «{$card->title}» (Бэклог → «".PmStand::TASK_COLUMN.'»).')
                : $this->components->warn("Карточка с таким названием уже есть: {$card->key()} — новая не заведена.");
            $this->line($card->key());

            return self::SUCCESS;
        });
    }

    /**
     * @return array{title: string, description: string, substage?: string|null}
     */
    private function readTask(string $path): array
    {
        try {
            $task = is_file($path) ? json_decode((string) file_get_contents($path), true, 32, JSON_THROW_ON_ERROR) : null;
        } catch (JsonException $e) {
            throw ValidationException::withMessages(['file' => "{$path}: некорректный JSON ({$e->getMessage()})."]);
        }
        if (! is_array($task)) {
            throw ValidationException::withMessages(['file' => "Нет файла {$path} или в нём не объект JSON."]);
        }

        /** @var array{title: string, description: string, substage?: string|null} */
        return Validator::make($task, [
            'title' => ['required', 'string', 'max:500'],
            'description' => ['required', 'string', 'max:20000'],
            'substage' => ['nullable', 'string', 'regex:/^\d{1,2}[a-z]?$/'],
        ], [
            'substage.regex' => 'substage — номер подэтапа, например 3c.',
        ])->validate();
    }
}
