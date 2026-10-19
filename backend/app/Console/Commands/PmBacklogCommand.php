<?php

namespace App\Console\Commands;

use App\Actions\PmStand\ImportDeferredAction;
use App\Actions\PmStand\SetUpPmSpaceAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Space;
use App\Models\User;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

/**
 * Стенд PM (make pm-backlog): пространство LATER с досками «Бэклог» и «Баги приёмки», метки и карточки
 * отложенных задач из docs/pm/deferred.yaml. Повторный запуск ничего не дублирует.
 */
#[Signature('pm:backlog {owner : Email PM — единственного администратора LATER} {file : YAML с отложенными задачами}')]
#[Description('Стенд PM: пространство LATER, доски, метки и карточки отложенных задач')]
class PmBacklogCommand extends Command
{
    use ReportsStandErrors;

    public function handle(SetUpPmSpaceAction $setUp, ImportDeferredAction $import): int
    {
        return $this->reportingErrors(function () use ($setUp, $import) {
            $items = $this->readItems((string) $this->argument('file'));
            $owner = PmStand::requireUser((string) $this->argument('owner'), $this->ownerHint());

            $space = PmStand::space();
            $space === null
                ? Gate::forUser($owner)->authorize('create', Space::class)
                : Gate::forUser($owner)->authorize('update', $space);

            $space = $setUp->handle($owner);
            $result = $import->handle($owner, $space, $items);

            foreach ($result['created'] as $card) {
                $this->line("  + {$card}");
            }
            $this->components->info(sprintf(
                'Пространство %s готово. Карточек добавлено: %d, уже были: %d.',
                $space->key,
                count($result['created']),
                count($result['skipped']),
            ));

            return self::SUCCESS;
        });
    }

    /** Подсказка при неизвестном email: чаще всего это опечатка, а не отсутствие учётной записи. */
    private function ownerHint(): string
    {
        $admins = User::query()
            ->whereIn('role', UserRole::systemAdmins())->where('status', UserStatus::Active)
            ->orderBy('email')->pluck('email');

        return $admins->isEmpty()
            ? 'заведите учётную запись: make pm-owner'
            : 'проверьте email на опечатку. Администраторы на стенде: '.$admins->implode(', ');
    }

    /**
     * @return list<array{title: string, column: string, labels?: list<string>, description: string}>
     */
    private function readItems(string $path): array
    {
        try {
            $items = Yaml::parseFile($path);
        } catch (ParseException $e) {
            throw ValidationException::withMessages(['file' => "Не удалось прочитать {$path}: {$e->getMessage()}"]);
        }

        $validator = Validator::make(['items' => $items], [
            'items' => ['required', 'list'],
            'items.*' => ['array:title,column,labels,description'],
            'items.*.title' => ['required', 'string', 'max:500', 'distinct:ignore_case'],
            'items.*.column' => ['required', 'string', Rule::in(array_keys(PmStand::BACKLOG_COLUMNS))],
            'items.*.labels' => ['sometimes', 'list'],
            'items.*.labels.*' => ['string', Rule::in(array_keys(PmStand::LABELS))],
            'items.*.description' => ['required', 'string', 'max:2000'],
        ]);

        /** @var array{items: list<array{title: string, column: string, labels?: list<string>, description: string}>} $valid */
        $valid = $validator->validate();

        return $valid['items'];
    }
}
