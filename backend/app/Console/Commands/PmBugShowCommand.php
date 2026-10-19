<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Models\Attachment;
use App\Models\Comment;
use App\Models\Label;
use App\Models\User;
use App\Services\PmStand\PmStand;
use App\Support\RichText\RichTextPlainText;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

/**
 * Стенд PM (make pm-bug-show): карточка LATER целиком — название, колонка, метки, описание, комментарии;
 * вложения копируются в каталог --files (scripts/pm.sh переносит их в .pm-bugs основной копии). От имени QA-бота.
 */
#[Signature('pm:bug-show {card : Номер карточки, например LATER-12} {--bot= : Email QA-бота} {--files= : Каталог, куда сложить вложения}')]
#[Description('Стенд PM: карточка-баг целиком, вложения — в каталог')]
class PmBugShowCommand extends Command
{
    use ReportsStandErrors;

    public function handle(): int
    {
        return $this->reportingErrors(function () {
            $bot = PmStand::requireUser((string) $this->option('bot'), 'заведите его: make pm-qa-bot');
            $card = PmStand::requireCard((string) $this->argument('card'));
            Gate::forUser($bot)->authorize('view', $card);
            $card->load(['board', 'column', 'type', 'labels', 'customer', 'responsible']);

            $names = [];
            $mention = function (string $id) use (&$names): string {
                return $names[$id] ??= User::query()->whereKey($id)->value('name') ?? 'пользователь';
            };

            $this->line(sprintf(
                '%s · %s · «%s» / «%s»%s',
                $card->key(),
                $card->type->name,
                $card->board->name,
                $card->column->name,
                $card->isArchived() ? ' · в архиве' : '',
            ));
            $this->line('Название: '.$card->title);
            $this->line('Метки: '.($card->labels->isEmpty() ? '—' : $card->labels->map(fn (Label $l) => $l->name)->implode(', ')));
            $this->line(sprintf(
                'Заказчик: %s · ответственный: %s · создана %s',
                $card->customer->name ?? '—',
                $card->responsible->name ?? 'не назначен',
                $this->time($card->created_at),
            ));

            $this->newLine();
            $this->line('Описание:');
            $this->line($this->indent(RichTextPlainText::render($card->description, Closure::fromCallable($mention)) ?: '—'));

            $comments = Comment::query()->where('card_id', $card->id)->whereNull('deleted_at')
                ->with('author')->orderBy('created_at')->orderBy('id')->get();
            $this->newLine();
            $this->line("Комментарии ({$comments->count()}):");
            foreach ($comments as $comment) {
                $this->line("  [{$this->time($comment->created_at)}] {$comment->author->name}:");
                $this->line($this->indent(RichTextPlainText::render($comment->body, Closure::fromCallable($mention)), 4));
            }

            $attachments = Attachment::query()->where('card_id', $card->id)->whereNull('deleted_at')
                ->orderBy('created_at')->orderBy('id')->get();
            $this->newLine();
            $this->line("Вложения ({$attachments->count()}):");
            $files = (string) $this->option('files');
            foreach ($attachments->values() as $i => $attachment) {
                // Номер впереди: у двух скриншотов может быть одно имя. Неразрывные пробелы (имена снимков экрана
                // macOS: «Снимок экрана — … в 09.56.26») — обычными, иначе по пути файл не открыть
                $name = ($i + 1).'-'.preg_replace('/\p{Z}+/u', ' ', str_replace(['/', '\\', "\0"], '_', $attachment->name));
                if ($files !== '') {
                    is_dir($files) || mkdir($files, 0755, true);
                    file_put_contents("{$files}/{$name}", Storage::disk($attachment->disk)->get($attachment->path));
                }
                $this->line("  {$name}");
            }

            return self::SUCCESS;
        });
    }

    private function time(?CarbonInterface $time): string
    {
        return $time?->copy()->timezone((string) config('selen.default_timezone'))->format('d.m.Y H:i') ?? '—';
    }

    private function indent(string $text, int $spaces = 2): string
    {
        return implode("\n", array_map(fn (string $line) => str_repeat(' ', $spaces).$line, explode("\n", $text)));
    }
}
