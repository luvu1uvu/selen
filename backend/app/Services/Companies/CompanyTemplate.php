<?php

namespace App\Services\Companies;

use App\Models\CardType;
use App\Models\Company;
use App\Models\Group;
use Illuminate\Support\Facades\DB;

/**
 * Шаблон справочников новой компании (docs/adr/0024-rights-2.md, В7; решение PM 23.10): набор в коде, один на все
 * компании, меняется по просьбе PM. Новая компания получает копию — дальше её справочники независимы.
 * Сейчас: «Все сотрудники» и четыре типа карточек, как у «Компании 1» (Задача — по умолчанию); общих меток и групп
 * нет. Справочники «Компании 1» — те, что были до компаний (миграции этапов 1–3).
 */
class CompanyTemplate
{
    /** Типы карточек: название, цвет, по умолчанию. */
    public const CARD_TYPES = [
        ['Задача', '#3b82f6', true],
        ['Баг', '#ef4444', false],
        ['История', '#22c55e', false],
        ['Эпик', '#a855f7', false],
    ];

    public const EVERYONE_NAME = 'Все сотрудники';

    public const EVERYONE_DESCRIPTION = 'Встроенная группа: в неё автоматически входят все активные сотрудники.';

    public function apply(Company $company): void
    {
        DB::transaction(function () use ($company) {
            $everyone = new Group(['name' => self::EVERYONE_NAME, 'description' => self::EVERYONE_DESCRIPTION]);
            $everyone->forceFill(['company_id' => $company->id, 'system_key' => Group::EVERYONE])->save();

            foreach (self::CARD_TYPES as [$name, $color, $default]) {
                $type = new CardType(['name' => $name, 'color' => $color]);
                $type->forceFill(['company_id' => $company->id, 'is_default' => $default])->save();
            }
        });
    }
}
