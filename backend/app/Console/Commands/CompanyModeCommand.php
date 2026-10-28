<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Режим копии (ADR-0026) и сверка с базой. Режим «одна компания», а компаний в базе несколько (включили режим
 * «несколько компаний», создали компанию и выключили; восстановили чужой бэкап) — предупреждение и код выхода 1.
 * Работать это не мешает: права и изоляция компаний от режима не зависят, скрыты только «Компании» и гости.
 * Запускается по расписанию раз в сутки (routes/console.php) — предупреждение в лог; из make host-status и задания
 * бэкапа на стенде (каждый час) — с --warning: только текст предупреждения, без таблицы и без записи в лог.
 */
#[Signature('app:company-mode {--warning : Только предупреждение (пусто, если всё в порядке)}')]
#[Description('Режим копии (одна или несколько компаний) и сверка с базой')]
class CompanyModeCommand extends Command
{
    public function handle(): int
    {
        $multi = (bool) config('selen.multi_company');
        $count = Company::query()->count();

        if (! $this->option('warning')) {
            $this->components->twoColumnDetail('Режим', $multi
                ? 'несколько компаний (SELEN_MULTI_COMPANY=true)'
                : 'одна компания (SELEN_MULTI_COMPANY=false)');
            $this->components->twoColumnDetail('Компаний в базе', (string) $count);
        }

        if ($multi || $count <= 1) {
            return self::SUCCESS;
        }

        $warning = "Режим «одна компания», а в базе компаний: {$count}. Данные доступны как прежде, но «Компании» и гости"
            .' скрыты. Вернуть режим — SELEN_MULTI_COMPANY=true в .env и перезапуск (ADR-0026)';
        if ($this->option('warning')) {
            $this->line($warning);
        } else {
            Log::warning($warning, ['companies' => $count]);
            $this->components->warn($warning);
        }

        return self::FAILURE;
    }
}
