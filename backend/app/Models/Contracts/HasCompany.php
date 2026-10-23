<?php

namespace App\Models\Contracts;

/**
 * Объект данных компании (docs/adr/0024-rights-2.md): своя колонка company_id (трейт BelongsToCompany) или компания
 * через пространство (доски, карточки и всё внутри них). По ней журнал событий получает компанию события.
 */
interface HasCompany
{
    /** Компания объекта; null — общий для всех компаний (стандартная роль). */
    public function companyId(): ?string;
}
