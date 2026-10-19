<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Описание карточки — документ Tiptap (JSON) вместо текста (docs/adr/0009-rich-text.md).
 * Существующий текст переносится как абзацы: одна строка — один абзац.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE cards ADD COLUMN description_doc jsonb');

        DB::table('cards')->whereNotNull('description')->orderBy('id')->select(['id', 'description'])
            ->chunkById(500, function ($cards) {
                foreach ($cards as $card) {
                    $paragraphs = array_map(
                        fn (string $line) => $line === ''
                            ? ['type' => 'paragraph']
                            : ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $line]]],
                        preg_split('/\R/u', (string) $card->description) ?: [],
                    );
                    DB::table('cards')->where('id', $card->id)->update([
                        'description_doc' => json_encode(['type' => 'doc', 'content' => $paragraphs], JSON_UNESCAPED_UNICODE),
                    ]);
                }
            });

        DB::statement('ALTER TABLE cards DROP COLUMN description');
        DB::statement('ALTER TABLE cards RENAME COLUMN description_doc TO description');
    }

    public function down(): void
    {
        // Обратно — только текст абзацев, форматирование теряется
        DB::statement('ALTER TABLE cards ADD COLUMN description_text text');
        DB::statement(<<<'SQL'
            UPDATE cards SET description_text = (
                SELECT string_agg(COALESCE((SELECT string_agg(t->>'text', '') FROM jsonb_array_elements(p->'content') t), ''), E'\n')
                FROM jsonb_array_elements(description->'content') p
            ) WHERE description IS NOT NULL
            SQL);
        DB::statement('ALTER TABLE cards DROP COLUMN description');
        DB::statement('ALTER TABLE cards RENAME COLUMN description_text TO description');
    }
};
