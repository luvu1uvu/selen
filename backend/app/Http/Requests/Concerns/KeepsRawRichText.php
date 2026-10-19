<?php

namespace App\Http\Requests\Concerns;

/**
 * Документ визуального редактора (ADR-0009) — как прислал клиент.
 *
 * Глобальные middleware TrimStrings и ConvertEmptyStringsToNull обходят весь JSON запроса и правят
 * строки внутри документа: текстовый узел « » превращается в null, пробелы по краям фрагментов
 * («Проверить с » перед упоминанием) пропадают — документ портится и не проходит проверку.
 * Поэтому поля-документы берутся из исходного тела запроса.
 */
trait KeepsRawRichText
{
    protected function restoreRawRichText(string ...$fields): void
    {
        $raw = json_decode($this->getContent(), true);
        if (! is_array($raw)) {
            return;
        }

        foreach ($fields as $field) {
            if (array_key_exists($field, $raw)) {
                $this->merge([$field => $raw[$field]]);
            }
        }
    }
}
