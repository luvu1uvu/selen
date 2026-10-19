<?php

namespace App\Support\RichText;

use Closure;

/**
 * Документ Tiptap (ADR-0009) → простой текст с лёгкой разметкой: для консоли (make pm-bug-show).
 * Заголовки — «## », списки — «- » и «1. », упоминания — «@Имя», ссылки — «текст (адрес)», картинки — «[картинка: имя]».
 */
final class RichTextPlainText
{
    /**
     * @param  array<mixed>|null  $doc
     * @param  Closure(string): string  $mentionName  имя пользователя по id упоминания
     */
    public static function render(?array $doc, Closure $mentionName): string
    {
        if ($doc === null) {
            return '';
        }

        return trim(implode("\n", self::blocks($doc['content'] ?? [], $mentionName, '')));
    }

    /**
     * @param  array<mixed>  $nodes
     * @return list<string>
     */
    private static function blocks(array $nodes, Closure $mentionName, string $indent): array
    {
        $lines = [];
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }
            $content = is_array($node['content'] ?? null) ? $node['content'] : [];
            $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];

            switch ($node['type'] ?? null) {
                case 'heading':
                    $lines[] = $indent.str_repeat('#', (int) ($attrs['level'] ?? 1)).' '.self::inline($content, $mentionName);
                    break;
                case 'bulletList':
                case 'orderedList':
                case 'taskList':
                    $number = (int) ($attrs['start'] ?? 1);
                    foreach ($content as $item) {
                        $marker = match ($node['type']) {
                            'orderedList' => ($number++).'.',
                            'taskList' => (($item['attrs']['checked'] ?? false) ? '[x]' : '[ ]'),
                            default => '-',
                        };
                        $itemLines = self::blocks(is_array($item['content'] ?? null) ? $item['content'] : [], $mentionName, $indent.'   ');
                        $first = ltrim((string) array_shift($itemLines));
                        $lines[] = $indent.$marker.' '.$first;
                        array_push($lines, ...$itemLines);
                    }
                    break;
                case 'blockquote':
                    foreach (self::blocks($content, $mentionName, '') as $line) {
                        $lines[] = $indent.'> '.$line;
                    }
                    break;
                case 'codeBlock':
                    $lines[] = $indent.'```';
                    foreach (explode("\n", self::inline($content, $mentionName)) as $line) {
                        $lines[] = $indent.$line;
                    }
                    $lines[] = $indent.'```';
                    break;
                case 'horizontalRule':
                    $lines[] = $indent.'---';
                    break;
                case 'image':
                    $lines[] = $indent.'[картинка: '.($attrs['alt'] ?? 'без названия').']';
                    break;
                default: // paragraph и неизвестное — как абзац
                    $lines[] = $indent.self::inline($content, $mentionName);
            }
        }

        return $lines;
    }

    /**
     * @param  array<mixed>  $nodes
     */
    private static function inline(array $nodes, Closure $mentionName): string
    {
        $text = '';
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }
            $text .= match ($node['type'] ?? null) {
                'text' => self::linked((string) ($node['text'] ?? ''), $node['marks'] ?? []),
                'mention' => '@'.$mentionName((string) ($node['attrs']['id'] ?? '')),
                'hardBreak' => "\n",
                'image' => '[картинка: '.($node['attrs']['alt'] ?? 'без названия').']',
                default => self::inline(is_array($node['content'] ?? null) ? $node['content'] : [], $mentionName),
            };
        }

        return $text;
    }

    private static function linked(string $text, mixed $marks): string
    {
        foreach (is_array($marks) ? $marks : [] as $mark) {
            $href = is_array($mark) && ($mark['type'] ?? null) === 'link' ? ($mark['attrs']['href'] ?? null) : null;
            if (is_string($href) && $href !== $text) {
                return "{$text} ({$href})";
            }
        }

        return $text;
    }
}
