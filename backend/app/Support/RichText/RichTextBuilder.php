<?php

namespace App\Support\RichText;

/**
 * Сборка документа Tiptap (ADR-0009) из простого текста — для описаний, которые создаются не в редакторе
 * (команды стенда PM). Результат проходит тот же белый список RichTextDocument, что и ввод из интерфейса.
 */
final class RichTextBuilder
{
    /**
     * @param  list<array<string, mixed>>  $blocks
     * @return array<string, mixed>
     */
    public static function doc(array $blocks): array
    {
        return ['type' => 'doc', 'content' => $blocks];
    }

    /**
     * Каждая непустая строка — отдельный абзац.
     *
     * @return list<array<string, mixed>>
     */
    public static function paragraphs(string $text): array
    {
        return array_map(
            fn (string $line) => ['type' => 'paragraph', 'content' => [self::text($line)]],
            self::lines($text),
        );
    }

    /** @return array<string, mixed> */
    public static function heading(string $text, int $level = 3): array
    {
        return ['type' => 'heading', 'attrs' => ['level' => $level], 'content' => [self::text($text)]];
    }

    /**
     * @param  list<string>  $items
     * @return array<string, mixed>
     */
    public static function orderedList(array $items): array
    {
        return [
            'type' => 'orderedList',
            'attrs' => ['start' => 1, 'type' => null],
            'content' => array_map(fn (string $item) => [
                'type' => 'listItem',
                'content' => [['type' => 'paragraph', 'content' => [self::text($item)]]],
            ], $items),
        ];
    }

    /**
     * Картинка из вложения той же карточки.
     *
     * @return array<string, mixed>
     */
    public static function image(string $attachmentId, string $alt): array
    {
        return ['type' => 'image', 'attrs' => ['attachmentId' => $attachmentId, 'alt' => mb_substr($alt, 0, 255)]];
    }

    /**
     * Простая разметка текста (комментарии из консоли): «# »–«### » — заголовок, «1. » — нумерованный список,
     * «- » или «* » — список, остальные непустые строки — абзацы; адреса http(s) становятся ссылками.
     *
     * @return array<string, mixed>
     */
    public static function fromMarkdown(string $text): array
    {
        $blocks = [];
        $listType = null; // orderedList | bulletList — текущий незакрытый список
        $items = [];

        foreach ([...(preg_split('/\R/u', $text) ?: []), ''] as $line) {
            $line = trim($line);
            $isItem = preg_match('/^(?:(\d+)[.)]|([-*]))\s+(.+)$/u', $line, $item) === 1;
            $type = $isItem ? ($item[1] !== '' ? 'orderedList' : 'bulletList') : null;

            // Список закрывается пустой строкой, обычной строкой или пунктом другого вида
            if ($listType !== null && $type !== $listType) {
                $blocks[] = self::listBlock($listType, $items);
                $listType = null;
                $items = [];
            }

            if ($type !== null) {
                $listType = $type;
                $items[] = $item[3];
            } elseif (preg_match('/^(#{1,3})\s+(.+)$/u', $line, $heading) === 1) {
                $blocks[] = ['type' => 'heading', 'attrs' => ['level' => strlen($heading[1])], 'content' => self::inline($heading[2])];
            } elseif ($line !== '') {
                $blocks[] = ['type' => 'paragraph', 'content' => self::inline($line)];
            }
        }

        return self::doc($blocks);
    }

    /**
     * @param  list<string>  $items
     * @return array<string, mixed>
     */
    private static function listBlock(string $type, array $items): array
    {
        return [
            'type' => $type,
            ...($type === 'orderedList' ? ['attrs' => ['start' => 1, 'type' => null]] : []),
            'content' => array_map(fn (string $item) => [
                'type' => 'listItem',
                'content' => [['type' => 'paragraph', 'content' => self::inline($item)]],
            ], $items),
        ];
    }

    /**
     * Текст строки: адреса http(s) — ссылки (знаки препинания в конце адреса — не часть ссылки).
     *
     * @return list<array<string, mixed>>
     */
    private static function inline(string $text): array
    {
        $parts = preg_split('~(https?://[^\s<>«»"]+?)(?=[.,;:!?)]*(?:\s|$))~u', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];

        return array_map(fn (string $part) => preg_match('~^https?://~', $part) === 1
            ? self::text($part) + ['marks' => [[
                'type' => 'link',
                'attrs' => ['href' => $part, 'target' => '_blank', 'rel' => 'noopener noreferrer nofollow', 'class' => null],
            ]]]
            : self::text($part), $parts);
    }

    /**
     * Непустые строки текста без пробелов по краям.
     *
     * @return list<string>
     */
    public static function lines(string $text): array
    {
        return array_values(array_filter(
            array_map('trim', preg_split('/\R/u', $text) ?: []),
            fn (string $line) => $line !== '',
        ));
    }

    /** @return array<string, mixed> */
    private static function text(string $text): array
    {
        return ['type' => 'text', 'text' => $text];
    }
}
