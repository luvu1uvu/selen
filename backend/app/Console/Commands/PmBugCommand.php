<?php

namespace App\Console\Commands;

use App\Actions\PmStand\ReportBugAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use JsonException;

/**
 * Стенд PM (make pm-bug): карточка-баг на доске «Баги приёмки» от имени QA-бота. Формат JSON —
 * docs/runbook.md, «Стенд PM». Последняя строка вывода — номер карточки (LATER-12) для отчёта.
 */
#[Signature('pm:bug {file : JSON с описанием бага} {--owner= : Email PM — заводит метку подэтапа, если её нет} {--bot= : Email QA-бота} {--screenshot= : Скриншот (вместо поля screenshot из JSON)}')]
#[Description('Стенд PM: карточка-баг от имени QA-бота на доске «Баги приёмки»')]
class PmBugCommand extends Command
{
    use ReportsStandErrors;

    /** Скриншот — только картинка, как в превью вложений. */
    private const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

    public function handle(ReportBugAction $action): int
    {
        return $this->reportingErrors(function () use ($action) {
            $file = (string) $this->argument('file');
            $bug = $this->readBug($file);
            $screenshot = $this->screenshot($this->option('screenshot') ?? $bug['screenshot'] ?? null, dirname($file));

            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $owner = PmStand::requireUser((string) $this->option('owner'), PmStand::OWNER_HINT);
            $space = PmStand::requireSpace();
            Gate::forUser($bot)->authorize('createCard', PmStand::requireBoard($space, PmStand::BUGS_BOARD));
            Gate::forUser($owner)->authorize('createLabel', $space);

            ['card' => $card, 'missing_labels' => $missing] = $action->handle($bot, $owner, $bug, $screenshot);

            $this->components->info("Баг заведён: {$card->key()} «{$card->title}».");
            foreach ($missing as $name) {
                $this->components->warn("Метки «{$name}» на стенде нет — карточка без неё. Метки заводит PM.");
            }
            $this->line($card->key());

            return self::SUCCESS;
        });
    }

    /**
     * @return array{title: string, test_case: string, steps: string|list<string>, expected: string, actual: string, substage?: string|null, labels?: list<string>, screenshot?: string|null}
     */
    private function readBug(string $path): array
    {
        try {
            $bug = is_file($path) ? json_decode((string) file_get_contents($path), true, 32, JSON_THROW_ON_ERROR) : null;
        } catch (JsonException $e) {
            throw ValidationException::withMessages(['file' => "{$path}: некорректный JSON ({$e->getMessage()})."]);
        }
        if (! is_array($bug)) {
            throw ValidationException::withMessages(['file' => "Нет файла {$path} или в нём не объект JSON."]);
        }

        $validator = Validator::make($bug, [
            'title' => ['required', 'string', 'max:500'],
            'test_case' => ['required', 'string', 'max:500'],
            'steps' => ['required', function (string $attribute, mixed $value, \Closure $fail) {
                $valid = is_string($value) || (is_array($value) && array_is_list($value) && $value !== []
                    && array_filter($value, fn (mixed $step) => ! is_string($step) || trim($step) === '') === []);
                if (! $valid) {
                    $fail('steps — строка или непустой список строк.');
                }
            }],
            'expected' => ['required', 'string', 'max:5000'],
            'actual' => ['required', 'string', 'max:5000'],
            // Метка подэтапа или существующие метки стенда (например, «безопасность»): хотя бы что-то одно
            'substage' => ['required_without:labels', 'nullable', 'string', 'regex:/^\d{1,2}[a-z]?$/'],
            'labels' => ['required_without:substage', 'array', 'list'],
            'labels.*' => ['required', 'string', 'max:50'],
            'screenshot' => ['nullable', 'string'],
        ], [
            'substage.regex' => 'substage — номер подэтапа, например 3c.',
            'substage.required_without' => 'Нужна метка: substage (номер подэтапа) или labels (метки стенда).',
            'labels.list' => 'labels — список названий меток.',
        ]);

        /** @var array{title: string, test_case: string, steps: string|list<string>, expected: string, actual: string, substage?: string|null, labels?: list<string>, screenshot?: string|null} */
        return $validator->validate();
    }

    /** Путь к скриншоту — абсолютный или относительно файла JSON. */
    private function screenshot(?string $path, string $baseDir): ?UploadedFile
    {
        if ($path === null || $path === '') {
            return null;
        }
        $full = str_starts_with($path, '/') ? $path : $baseDir.'/'.$path;
        $mime = is_file($full) ? mime_content_type($full) : false;

        if (! in_array($mime, self::IMAGE_TYPES, true)) {
            throw ValidationException::withMessages([
                'screenshot' => "Скриншот {$path}: нет такого файла или это не картинка (PNG, JPEG, WebP, GIF).",
            ]);
        }

        return new UploadedFile($full, basename($full), $mime, null, true);
    }
}
