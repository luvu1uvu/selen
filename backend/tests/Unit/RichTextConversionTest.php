<?php

use App\Support\RichText\RichTextBuilder;
use App\Support\RichText\RichTextDocument;
use App\Support\RichText\RichTextPlainText;

// Текст из консоли (make pm-bug-comment) → документ редактора и обратно (make pm-bug-show)
$markdown = <<<'TEXT'
    ## Причина
    Цель перетаскивания считалась по углам карточек.

    ### Исправлено
    1. Колонка — по указателю
    2. onDragEnd учитывает переход
    - PR: https://github.com/luvu1uvu/selen/pull/13.
    TEXT;

it('разметка из консоли становится документом редактора, который проходит белый список', function () use ($markdown) {
    $doc = RichTextBuilder::fromMarkdown($markdown);

    expect(array_column($doc['content'], 'type'))->toBe(['heading', 'paragraph', 'heading', 'orderedList', 'bulletList'])
        ->and($doc['content'][0]['attrs']['level'])->toBe(2)
        ->and($doc['content'][3]['content'])->toHaveCount(2);

    // Ссылка без точки в конце; текст до неё — отдельно
    $link = $doc['content'][4]['content'][0]['content'][0]['content'];
    expect($link[0]['text'])->toBe('PR: ')
        ->and($link[1]['marks'][0]['attrs']['href'])->toBe('https://github.com/luvu1uvu/selen/pull/13')
        ->and($link[2]['text'])->toBe('.');

    new RichTextDocument($doc); // бросает исключение, если документ не из белого списка
});

it('документ редактора читается в консоли: заголовки, списки, упоминания, ссылки, картинки', function () use ($markdown) {
    $doc = RichTextBuilder::fromMarkdown($markdown);
    $doc['content'][] = ['type' => 'paragraph', 'content' => [
        ['type' => 'text', 'text' => 'Проверь, '],
        ['type' => 'mention', 'attrs' => ['id' => '01k0000000000000000000000a']],
    ]];
    $doc['content'][] = RichTextBuilder::image('01k0000000000000000000000b', 'screen.png');

    expect(RichTextPlainText::render($doc, fn (string $id) => 'Анна'))->toBe(<<<'TEXT'
        ## Причина
        Цель перетаскивания считалась по углам карточек.
        ### Исправлено
        1. Колонка — по указателю
        2. onDragEnd учитывает переход
        - PR: https://github.com/luvu1uvu/selen/pull/13.
        Проверь, @Анна
        [картинка: screen.png]
        TEXT)
        ->and(RichTextPlainText::render(null, fn () => ''))->toBe('');
});
