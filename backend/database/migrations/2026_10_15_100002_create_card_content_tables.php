<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Содержимое карточки (этап 2b): комментарии, упоминания, чек-листы, ссылки, вложения.
 * Всё принадлежит карточке и видно тем, кто видит карточку (ADR-0008).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Комментарий — документ Tiptap. Удаление мягкое: строка остаётся, текст стирается (решение PM)
        Schema::create('comments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('author_id')->constrained('users')->restrictOnDelete();
            $table->jsonb('body')->nullable();
            $table->timestampTz('edited_at')->nullable();
            $table->timestampTz('deleted_at')->nullable();
            $table->timestampsTz(6);

            $table->index(['card_id', 'created_at']);
        });

        // Упоминания @сотрудник в описании и комментариях — для уведомлений этапа 3
        Schema::create('mentions', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            // card — описание карточки (source_id = id карточки), comment — комментарий
            $table->string('source_type', 20);
            $table->ulid('source_id');
            $table->foreignUlid('mentioned_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->unique(['source_type', 'source_id', 'user_id']);
            $table->index(['user_id', 'created_at']);
            $table->index('card_id');
        });

        Schema::create('checklists', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->string('title', 200);
            $table->string('position', 255)->collation('C');
            $table->timestampsTz();

            $table->index(['card_id', 'position']);
        });

        Schema::create('checklist_items', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('checklist_id')->constrained()->cascadeOnDelete();
            $table->string('text', 1000);
            $table->boolean('is_done')->default(false);
            $table->timestampTz('done_at')->nullable();
            $table->foreignUlid('done_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('position', 255)->collation('C');
            $table->timestampsTz();

            $table->index(['checklist_id', 'position']);
        });

        // Ссылки на внешние ресурсы (документы, макеты Figma и т. п.)
        Schema::create('card_links', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->string('url', 2048);
            $table->string('title', 200)->nullable();
            $table->foreignUlid('created_by')->constrained('users')->restrictOnDelete();
            $table->timestampsTz();

            $table->index('card_id');
        });

        // Вложения: файл на диске attachments (docs/adr/0010-attachments.md). Удаление мягкое,
        // сам файл стирается через 30 дней (model:prune) — так бэкап остаётся согласованным.
        Schema::create('attachments', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('disk', 50);
            // {card_id}/{ulid} — исходное имя в путь не попадает
            $table->string('path', 255);
            $table->string('name', 255);
            // Тип по содержимому (finfo), не по расширению
            $table->string('mime', 150);
            $table->unsignedBigInteger('size');
            $table->string('kind', 10);
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignUlid('deleted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampsTz(6);

            $table->index(['card_id', 'created_at']);
        });

        DB::statement("ALTER TABLE mentions ADD CONSTRAINT mentions_source_check CHECK (source_type IN ('card', 'comment'))");
        DB::statement("ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('image', 'video', 'file'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('card_links');
        Schema::dropIfExists('checklist_items');
        Schema::dropIfExists('checklists');
        Schema::dropIfExists('mentions');
        Schema::dropIfExists('comments');
    }
};
