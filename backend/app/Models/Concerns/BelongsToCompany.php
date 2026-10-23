<?php

namespace App\Models\Concerns;

use App\Models\Company;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Модель со своей колонкой company_id (docs/adr/0024-rights-2.md): справочники и выборки — inCompany(), связи между
 * компаниями запрещены в БД. Новая модель с company_id — с этим трейтом (arch-тест CompanyArchTest).
 *
 * @property string $company_id
 * @property-read Company $company
 */
trait BelongsToCompany
{
    /** @return BelongsTo<Company, $this> */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** @param  Builder<static>  $query */
    public function scopeInCompany(Builder $query, Company|string $company): void
    {
        $query->where($this->qualifyColumn('company_id'), $company instanceof Company ? $company->getKey() : $company);
    }

    public function companyId(): ?string
    {
        return $this->getAttribute('company_id');
    }
}
