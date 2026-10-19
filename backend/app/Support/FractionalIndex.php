<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Дробные ключи порядка (fractional indexing): строка, по которой сортируются элементы списка.
 * Между любыми двумя ключами всегда есть третий — вставка и перестановка меняют позицию
 * только одного элемента, без перенумерования соседей. Обоснование — docs/adr/0007-positions.md.
 *
 * Порт алгоритма rocicorp/fractional-indexing (CC0, https://github.com/rocicorp/fractional-indexing),
 * основанного на статье David Greenspan «Implementing Fractional Indexing».
 *
 * Ключи сравниваются побайтово: в PostgreSQL колонки позиций объявлены с COLLATE "C".
 */
final class FractionalIndex
{
    public const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    private const SMALLEST_INTEGER = 'A00000000000000000000000000';

    /**
     * Ключ строго между $a и $b. null — граница списка (начало для $a, конец для $b).
     */
    public static function between(?string $a, ?string $b): string
    {
        if ($a !== null) {
            self::validateKey($a);
        }
        if ($b !== null) {
            self::validateKey($b);
        }
        if ($a !== null && $b !== null && strcmp($a, $b) >= 0) {
            throw new InvalidArgumentException("Ключ «{$a}» должен быть меньше «{$b}».");
        }

        if ($a === null) {
            if ($b === null) {
                return 'a'.self::DIGITS[0];
            }

            $ib = self::integerPart($b);
            $fb = substr($b, strlen($ib));
            if ($ib === self::SMALLEST_INTEGER) {
                return $ib.self::midpoint('', $fb);
            }
            if (strcmp($ib, $b) < 0) {
                return $ib;
            }

            return self::decrementInteger($ib) ?? throw new InvalidArgumentException('Нельзя получить ключ меньше.');
        }

        if ($b === null) {
            $ia = self::integerPart($a);
            $fa = substr($a, strlen($ia));

            return self::incrementInteger($ia) ?? $ia.self::midpoint($fa, null);
        }

        $ia = self::integerPart($a);
        $fa = substr($a, strlen($ia));
        $ib = self::integerPart($b);
        $fb = substr($b, strlen($ib));

        if ($ia === $ib) {
            return $ia.self::midpoint($fa, $fb);
        }

        $i = self::incrementInteger($ia) ?? throw new InvalidArgumentException('Нельзя получить ключ больше.');

        return strcmp($i, $b) < 0 ? $i : $ia.self::midpoint($fa, null);
    }

    /**
     * $n ключей по порядку между $a и $b (например, для колонок шаблона доски).
     *
     * @return list<string>
     */
    public static function nBetween(?string $a, ?string $b, int $n): array
    {
        $keys = [];
        $previous = $a;
        for ($i = 0; $i < $n; $i++) {
            $previous = self::between($previous, $b);
            $keys[] = $previous;
        }

        return $keys;
    }

    /** Дробная часть строго между $a и $b ($b = null — без верхней границы). */
    private static function midpoint(string $a, ?string $b): string
    {
        $zero = self::DIGITS[0];

        if ($b !== null && strcmp($a, $b) >= 0) {
            throw new InvalidArgumentException("Дробная часть «{$a}» должна быть меньше «{$b}».");
        }
        if (str_ends_with($a, $zero) || ($b !== null && str_ends_with($b, $zero))) {
            throw new InvalidArgumentException('Дробная часть не может оканчиваться нулём.');
        }

        if ($b !== null) {
            // Общий префикс сохраняем как есть
            $n = 0;
            while (($a[$n] ?? $zero) === ($b[$n] ?? null)) {
                $n++;
            }
            if ($n > 0) {
                return substr($b, 0, $n).self::midpoint(substr($a, $n), substr($b, $n));
            }
        }

        $digitA = $a !== '' ? strpos(self::DIGITS, $a[0]) : 0;
        $digitB = $b !== null ? strpos(self::DIGITS, $b[0]) : strlen(self::DIGITS);

        if ($digitB - $digitA > 1) {
            return self::DIGITS[(int) round(0.5 * ($digitA + $digitB))];
        }

        if ($b !== null && strlen($b) > 1) {
            return $b[0];
        }

        return self::DIGITS[$digitA].self::midpoint(substr($a, 1), null);
    }

    private static function integerLength(string $head): int
    {
        if ($head >= 'a' && $head <= 'z') {
            return ord($head) - ord('a') + 2;
        }
        if ($head >= 'A' && $head <= 'Z') {
            return ord('Z') - ord($head) + 2;
        }

        throw new InvalidArgumentException("Недопустимый первый символ ключа «{$head}».");
    }

    private static function integerPart(string $key): string
    {
        $length = self::integerLength($key[0]);
        if ($length > strlen($key)) {
            throw new InvalidArgumentException("Недопустимый ключ «{$key}».");
        }

        return substr($key, 0, $length);
    }

    private static function validateKey(string $key): void
    {
        if ($key === '' || $key === self::SMALLEST_INTEGER) {
            throw new InvalidArgumentException("Недопустимый ключ «{$key}».");
        }

        $integer = self::integerPart($key);
        if (strspn(substr($key, 1), self::DIGITS) !== strlen($key) - 1) {
            throw new InvalidArgumentException("Недопустимый ключ «{$key}».");
        }
        if (str_ends_with(substr($key, strlen($integer)), self::DIGITS[0])) {
            throw new InvalidArgumentException("Недопустимый ключ «{$key}».");
        }
    }

    private static function incrementInteger(string $x): ?string
    {
        $head = $x[0];
        $digits = str_split(substr($x, 1));
        $carry = true;

        for ($i = count($digits) - 1; $carry && $i >= 0; $i--) {
            $d = strpos(self::DIGITS, $digits[$i]) + 1;
            if ($d === strlen(self::DIGITS)) {
                $digits[$i] = self::DIGITS[0];
            } else {
                $digits[$i] = self::DIGITS[$d];
                $carry = false;
            }
        }

        if (! $carry) {
            return $head.implode('', $digits);
        }
        if ($head === 'Z') {
            return 'a'.self::DIGITS[0];
        }
        if ($head === 'z') {
            return null;
        }

        $next = chr(ord($head) + 1);
        if ($next > 'a') {
            $digits[] = self::DIGITS[0];
        } else {
            array_pop($digits);
        }

        return $next.implode('', $digits);
    }

    private static function decrementInteger(string $x): ?string
    {
        $head = $x[0];
        $digits = str_split(substr($x, 1));
        $borrow = true;
        $last = self::DIGITS[strlen(self::DIGITS) - 1];

        for ($i = count($digits) - 1; $borrow && $i >= 0; $i--) {
            $d = strpos(self::DIGITS, $digits[$i]) - 1;
            if ($d === -1) {
                $digits[$i] = $last;
            } else {
                $digits[$i] = self::DIGITS[$d];
                $borrow = false;
            }
        }

        if (! $borrow) {
            return $head.implode('', $digits);
        }
        if ($head === 'a') {
            return 'Z'.$last;
        }
        if ($head === 'A') {
            return null;
        }

        $previous = chr(ord($head) - 1);
        if ($previous < 'Z') {
            $digits[] = $last;
        } else {
            array_pop($digits);
        }

        return $previous.implode('', $digits);
    }
}
