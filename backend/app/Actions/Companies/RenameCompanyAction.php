<?php

namespace App\Actions\Companies;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Переименование компании (только Владелец, ADR-0024). Событие — системное, без компании, как создание; название —
 * текст, в журнал не пишется.
 */
class RenameCompanyAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Company $company, string $name): Company
    {
        return DB::transaction(function () use ($actor, $company, $name) {
            $company->fill(['name' => $name]);
            if (! $company->isDirty('name')) {
                return $company;
            }

            $company->save();
            $this->events->record(EventType::CompanyRenamed, $actor, $company);

            return $company;
        });
    }
}
