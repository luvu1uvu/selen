<?php

namespace App\Http\Requests\Admin;

/** Нормализация полей узла дерева: пробелы по краям названия, пустая иконка — «без иконки». */
final class NavNodeInput
{
    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function normalize(array $input): array
    {
        $normalized = [];

        if (is_string($input['name'] ?? null)) {
            $normalized['name'] = trim($input['name']);
        }

        if (array_key_exists('icon', $input) && is_string($input['icon'])) {
            $icon = trim($input['icon']);
            $normalized['icon'] = $icon === '' ? null : $icon;
        }

        return $normalized;
    }
}
