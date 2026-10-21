<?php

namespace App\Console\Commands;

use App\Models\Board;
use App\Models\Card;
use App\Models\Space;
use App\Services\Metrics\CardFlowMetrics;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Date;

/**
 * Сводка lead time и cycle time по доскам пространства — для проверки метрик на данных
 * (например, на демо-данных за 60 дней). Это не отчёт: отчёты и графики — этап 5.
 * Считает тем же сервисом CardFlowMetrics, что и панель карточки (только по card_transitions).
 *
 *   php artisan app:flow-metrics DEV            — карточки, завершённые за последние 30 дней
 *   php artisan app:flow-metrics DEV --days=60  — за 60 дней
 */
#[Signature('app:flow-metrics {space : Ключ пространства, например DEV} {--days=30 : За сколько последних дней брать завершённые карточки}')]
#[Description('Сводка lead time и cycle time по доскам пространства')]
class FlowMetricsCommand extends Command
{
    public function handle(CardFlowMetrics $metrics): int
    {
        $space = Space::query()->where('key', mb_strtoupper((string) $this->argument('space')))->first();
        if ($space === null) {
            $this->error('Пространство не найдено.');

            return self::FAILURE;
        }

        $days = max(1, (int) $this->option('days'));
        $since = Date::now()->subDays($days);
        $this->info("{$space->key} «{$space->name}»: карточки, завершённые за последние {$days} дн. (lead = создание → готово, cycle = начало работы → готово)");

        $rows = [];
        foreach ($space->boards()->active()->inLayoutOrder()->get() as $board) {
            $rows[] = $this->summary($board, $metrics, $since);
        }

        $this->table(
            ['Доска', 'Всего', 'В работе', 'Завершено', 'Lead: среднее', 'Lead: медиана', 'Cycle: среднее', 'Cycle: медиана'],
            $rows,
        );

        return self::SUCCESS;
    }

    /** @return list<string|int> */
    private function summary(Board $board, CardFlowMetrics $metrics, \DateTimeInterface $since): array
    {
        $cards = Card::query()->active()->where('board_id', $board->id)->get();
        $lead = [];
        $cycle = [];

        foreach ($cards->whereNotNull('completed_at')->where('completed_at', '>=', $since) as $card) {
            $times = $metrics->forCard($card);
            $lead[] = (int) $times->leadTimeSeconds();
            $cycle[] = (int) $times->cycleTimeSeconds();
        }

        return [
            $board->name,
            $cards->count(),
            $cards->whereNotNull('first_started_at')->whereNull('completed_at')->count(),
            count($lead),
            $this->duration($this->average($lead)),
            $this->duration($this->median($lead)),
            $this->duration($this->average($cycle)),
            $this->duration($this->median($cycle)),
        ];
    }

    /** @param list<int> $values */
    private function average(array $values): ?float
    {
        return $values === [] ? null : array_sum($values) / count($values);
    }

    /** @param list<int> $values */
    private function median(array $values): ?float
    {
        if ($values === []) {
            return null;
        }
        sort($values);
        $middle = intdiv(count($values), 2);

        return count($values) % 2 === 1 ? $values[$middle] : ($values[$middle - 1] + $values[$middle]) / 2;
    }

    private function duration(?float $seconds): string
    {
        if ($seconds === null) {
            return '—';
        }
        $hours = (int) round($seconds / 3600);

        return $hours >= 24 ? intdiv($hours, 24).' д '.($hours % 24).' ч' : $hours.' ч';
    }
}
