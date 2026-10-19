<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Ровно одна эмодзи (иконка папки или пространства в дереве): одна графема, которая начинается с эмодзи —
 * так проходят и составные (👨‍👩‍👧, 👍🏽, флаги, 1️⃣), а буквы, цифры и несколько эмодзи — нет.
 */
class Emoji implements ValidationRule
{
    private const PATTERN = '/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\x{FE0F}?\x{20E3})/u';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || grapheme_strlen($value) !== 1 || preg_match(self::PATTERN, $value) !== 1) {
            $fail(__('selen.navigation.icon_format'));
        }
    }
}
