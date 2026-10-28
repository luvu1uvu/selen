<?php

namespace App\Actions\Companies;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\User;
use App\Services\Companies\CompanyTemplate;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Новая компания (только Владелец, ADR-0024): справочники — копия шаблона (CompanyTemplate: «Все сотрудники» и четыре
 * типа карточек). Людей в ней пока нет: Владелец приглашает их сам (в том числе администратора компании) из её
 * «Пользователей». Событие — системное, без компании (видит только Владелец, решение PM 23.10); название — текст,
 * в журнал не пишется. В режиме «одна компания» (ADR-0026) вторую компанию не создать: маршрут — 404, здесь — отказ
 * для любого другого пути (сидер, консоль).
 */
class CreateCompanyAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CompanyTemplate $template,
    ) {}

    public function handle(User $actor, string $name): Company
    {
        if (! config('selen.multi_company')) {
            throw ValidationException::withMessages(['name' => __('selen.companies.single_company')]);
        }

        return DB::transaction(function () use ($actor, $name) {
            $company = new Company(['name' => $name]);
            $company->forceFill(['created_by' => $actor->id])->save();
            $this->template->apply($company);

            $this->events->record(EventType::CompanyCreated, $actor, $company);

            return $company;
        });
    }
}
