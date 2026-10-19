<?php

use App\Support\FractionalIndex;

// Эталонные значения — из тестов оригинальной библиотеки rocicorp/fractional-indexing
it('совпадает с эталонной реализацией', function (?string $a, ?string $b, string $expected) {
    expect(FractionalIndex::between($a, $b))->toBe($expected);
})->with([
    [null, null, 'a0'],
    [null, 'a0', 'Zz'],
    [null, 'Zz', 'Zy'],
    ['a0', null, 'a1'],
    ['a1', null, 'a2'],
    ['a0', 'a1', 'a0V'],
    ['a1', 'a2', 'a1V'],
    ['a0V', 'a1', 'a0l'],
    ['Zz', 'a0', 'ZzV'],
    ['Zz', 'a1', 'a0'],
    [null, 'Y00', 'Xzzz'],
    ['bzz', null, 'c000'],
    ['a0', 'a0V', 'a0G'],
    ['a0', 'a0G', 'a08'],
    ['b125', 'b129', 'b127'],
    ['a0', 'a1V', 'a1'],
    ['Zz', 'a01', 'a0'],
    [null, 'a0V', 'a0'],
    [null, 'b999', 'b99'],
    ['zzzzzzzzzzzzzzzzzzzzzzzzzzy', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzz'],
    ['zzzzzzzzzzzzzzzzzzzzzzzzzzz', null, 'zzzzzzzzzzzzzzzzzzzzzzzzzzzV'],
]);

it('отвергает неверные ключи и порядок', function (?string $a, ?string $b) {
    FractionalIndex::between($a, $b);
})->throws(InvalidArgumentException::class)->with([
    [null, 'A00000000000000000000000000'],
    ['a00', null],
    ['a00', 'a1'],
    ['0', '1'],
    ['a1', 'a0'],
    ['a1', 'a1'],
]);

it('многократные вставки в одно место сохраняют строгий порядок', function () {
    $low = FractionalIndex::between(null, null);
    $high = FractionalIndex::between($low, null);
    $keys = [$low, $high];

    // Всё время вставляем сразу после первого — худший случай для длины ключей
    for ($i = 0; $i < 500; $i++) {
        $key = FractionalIndex::between($keys[0], $keys[1]);
        array_splice($keys, 1, 0, [$key]);
    }
    // И в начало списка
    for ($i = 0; $i < 200; $i++) {
        array_unshift($keys, FractionalIndex::between(null, $keys[0]));
    }

    $sorted = $keys;
    usort($sorted, 'strcmp');
    expect($sorted)->toBe($keys)
        ->and(count(array_unique($keys)))->toBe(count($keys))
        ->and(max(array_map('strlen', $keys)))->toBeLessThan(120);
});

it('выдаёт n ключей по порядку', function () {
    $keys = FractionalIndex::nBetween(null, null, 8);

    $sorted = $keys;
    usort($sorted, 'strcmp');
    expect($keys)->toHaveCount(8)->and($sorted)->toBe($keys);
});
