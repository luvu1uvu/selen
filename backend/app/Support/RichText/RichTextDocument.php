<?php

namespace App\Support\RichText;

/**
 * Документ визуального редактора (Tiptap, JSON) — описание карточки и комментарии (docs/adr/0009-rich-text.md).
 *
 * Сервер проверяет документ по белому списку узлов, меток текста и их атрибутов. Всё, что не в списке, —
 * ошибка (422): сервер ничего молча не вырезает, клиент обязан прислать допустимый документ.
 * Ссылки — только http, https, mailto. Упоминание хранит только id пользователя (имя — из users при показе),
 * картинка — только id вложения (адрес строит клиент).
 *
 * Принадлежность упомянутых и вложений к карточке проверяет правило App\Rules\RichText.
 */
final class RichTextDocument
{
    public const MAX_BYTES = 200_000;

    public const MAX_DEPTH = 20;

    public const MAX_NODES = 5_000;

    /**
     * Узлы и их допустимые атрибуты: имя атрибута → проверка значения.
     * Атрибуты необязательны; null допустим там, где это значение Tiptap по умолчанию.
     *
     * @var array<string, array<string, callable(mixed): bool>>
     */
    private array $nodes;

    /** @var array<string, array<string, callable(mixed): bool>> */
    private array $marks;

    /** @var list<string> */
    private array $errors = [];

    /** @var list<string> */
    private array $mentions = [];

    /** @var list<string> */
    private array $images = [];

    private int $count = 0;

    /**
     * @param  array<mixed>  $document
     */
    public function __construct(private readonly array $document)
    {
        $ulid = fn (mixed $v) => is_string($v) && preg_match('/^[0-9a-hjkmnp-tv-z]{26}$/i', $v) === 1;
        $nullOr = fn (callable $check) => fn (mixed $v) => $v === null || $check($v);

        $this->nodes = [
            'doc' => [],
            'paragraph' => [],
            'text' => [],
            'heading' => ['level' => fn (mixed $v) => in_array($v, [1, 2, 3], true)],
            'bulletList' => [],
            'orderedList' => [
                'start' => fn (mixed $v) => is_int($v) && $v >= 1 && $v <= 100_000,
                'type' => $nullOr(fn (mixed $v) => in_array($v, ['1', 'a', 'A', 'i', 'I'], true)),
            ],
            'listItem' => [],
            'taskList' => [],
            'taskItem' => ['checked' => fn (mixed $v) => is_bool($v)],
            'blockquote' => [],
            'codeBlock' => ['language' => $nullOr(fn (mixed $v) => is_string($v) && preg_match('/^[a-z0-9+#._-]{1,30}$/i', $v) === 1)],
            'hardBreak' => [],
            'horizontalRule' => [],
            'mention' => [
                'id' => $ulid,
                'label' => fn (mixed $v) => $v === null,
                'mentionSuggestionChar' => fn (mixed $v) => $v === '@',
            ],
            'image' => [
                'attachmentId' => $ulid,
                'alt' => $nullOr(fn (mixed $v) => is_string($v) && mb_strlen($v) <= 255),
            ],
        ];

        $this->marks = [
            'bold' => [],
            'italic' => [],
            'strike' => [],
            'code' => [],
            'link' => [
                'href' => fn (mixed $v) => is_string($v) && self::isSafeUrl($v),
                'target' => $nullOr(fn (mixed $v) => $v === '_blank'),
                'rel' => $nullOr(fn (mixed $v) => $v === 'noopener noreferrer nofollow'),
                'class' => fn (mixed $v) => $v === null,
                'title' => $nullOr(fn (mixed $v) => is_string($v) && mb_strlen($v) <= 255),
            ],
        ];

        $this->check();
    }

    /** Ссылка безопасна: http, https или mailto, без пробелов и управляющих символов. */
    public static function isSafeUrl(string $url): bool
    {
        if (strlen($url) > 2048 || preg_match('/[\s\x00-\x1f\x7f]/', $url) === 1) {
            return false;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return match ($scheme) {
            'http', 'https' => parse_url($url, PHP_URL_HOST) !== null && parse_url($url, PHP_URL_HOST) !== '',
            'mailto' => strlen($url) > 7,
            default => false,
        };
    }

    public function isValid(): bool
    {
        return $this->errors === [];
    }

    /** @return list<string> */
    public function errors(): array
    {
        return $this->errors;
    }

    /**
     * Упомянутые пользователи (id, без повторов).
     *
     * @return list<string>
     */
    public function mentionedUserIds(): array
    {
        return array_values(array_unique($this->mentions));
    }

    /**
     * Вложения, вставленные картинками (id, без повторов).
     *
     * @return list<string>
     */
    public function imageAttachmentIds(): array
    {
        return array_values(array_unique($this->images));
    }

    /** В документе нет ни текста, ни упоминаний, ни картинок, ни горизонтальных линий. */
    public function isEmpty(): bool
    {
        return $this->isValid() && ! $this->hasContent($this->document);
    }

    private function check(): void
    {
        $json = json_encode($this->document, JSON_UNESCAPED_UNICODE);
        if ($json === false || strlen($json) > self::MAX_BYTES) {
            $this->errors[] = 'size';

            return;
        }

        if (($this->document['type'] ?? null) !== 'doc') {
            $this->errors[] = 'root';

            return;
        }

        $this->node($this->document, 0);

        if ($this->count > self::MAX_NODES) {
            $this->errors[] = 'nodes';
        }
    }

    /**
     * @param  mixed  $node
     */
    private function node($node, int $depth): void
    {
        $this->count++;

        if (! is_array($node) || $depth > self::MAX_DEPTH || $this->count > self::MAX_NODES) {
            $this->errors[] = 'structure';

            return;
        }

        $type = $node['type'] ?? null;
        if (! is_string($type) || ! array_key_exists($type, $this->nodes)) {
            $this->errors[] = 'node:'.(is_string($type) ? $type : '?');

            return;
        }

        $extra = array_diff(array_keys($node), ['type', 'attrs', 'content', 'marks', 'text']);
        if ($extra !== []) {
            $this->errors[] = "keys:{$type}";
        }

        $this->attributes("node:{$type}", $node['attrs'] ?? [], $this->nodes[$type]);

        if ($type === 'text') {
            if (! is_string($node['text'] ?? null) || $node['text'] === '' || isset($node['content'])) {
                $this->errors[] = 'text';
            }
            $this->textMarks($node['marks'] ?? []);

            return;
        }

        if (isset($node['text']) || isset($node['marks'])) {
            $this->errors[] = "keys:{$type}";
        }

        if ($type === 'mention' && isset($node['attrs']['id'])) {
            $this->mentions[] = (string) $node['attrs']['id'];
        }
        if ($type === 'image' && isset($node['attrs']['attachmentId'])) {
            $this->images[] = (string) $node['attrs']['attachmentId'];
        }
        if (in_array($type, ['mention', 'image'], true) && ! isset($node['attrs'][$type === 'mention' ? 'id' : 'attachmentId'])) {
            $this->errors[] = "attrs:{$type}";
        }

        $content = $node['content'] ?? [];
        if (! is_array($content) || ! array_is_list($content)) {
            $this->errors[] = "content:{$type}";

            return;
        }

        foreach ($content as $child) {
            $this->node($child, $depth + 1);
        }
    }

    /**
     * @param  mixed  $marks
     */
    private function textMarks($marks): void
    {
        if (! is_array($marks) || ! array_is_list($marks)) {
            $this->errors[] = 'marks';

            return;
        }

        foreach ($marks as $mark) {
            $type = is_array($mark) ? ($mark['type'] ?? null) : null;
            if (! is_string($type) || ! array_key_exists($type, $this->marks)) {
                $this->errors[] = 'mark:'.(is_string($type) ? $type : '?');

                continue;
            }
            if (array_diff(array_keys($mark), ['type', 'attrs']) !== []) {
                $this->errors[] = "keys:{$type}";
            }
            $this->attributes("mark:{$type}", $mark['attrs'] ?? [], $this->marks[$type]);
            if ($type === 'link' && ! isset($mark['attrs']['href'])) {
                $this->errors[] = 'attrs:link';
            }
        }
    }

    /**
     * @param  mixed  $attrs
     * @param  array<string, callable(mixed): bool>  $allowed
     */
    private function attributes(string $where, $attrs, array $allowed): void
    {
        if (! is_array($attrs) || ($attrs !== [] && array_is_list($attrs))) {
            $this->errors[] = "attrs:{$where}";

            return;
        }

        foreach ($attrs as $name => $value) {
            if (! isset($allowed[$name]) || ! $allowed[$name]($value)) {
                $this->errors[] = "attr:{$where}.{$name}";
            }
        }
    }

    /**
     * @param  array<mixed>  $node
     */
    private function hasContent(array $node): bool
    {
        $type = $node['type'] ?? null;
        if (in_array($type, ['mention', 'image', 'horizontalRule'], true)) {
            return true;
        }
        if ($type === 'text') {
            return trim((string) ($node['text'] ?? '')) !== '';
        }

        foreach ($node['content'] ?? [] as $child) {
            if (is_array($child) && $this->hasContent($child)) {
                return true;
            }
        }

        return false;
    }
}
