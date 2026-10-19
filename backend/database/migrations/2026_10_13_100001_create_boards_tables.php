<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Доски, колонки и дорожки. Ничего не удаляется — только архивируется.
 *
 * Позиции — дробные ключи (App\Support\FractionalIndex) с побайтовым сравнением COLLATE "C":
 * порядок в PostgreSQL совпадает с порядком в алгоритме. См. docs/adr/0007-positions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boards', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->string('position', 255)->collation('C');
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->index(['space_id', 'position']);
        });

        // Колонки: два уровня. Тип (категория) — только у колонки первого уровня, подколонки его наследуют.
        Schema::create('board_columns', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('board_id')->constrained()->restrictOnDelete();
            $table->ulid('parent_id')->nullable();
            $table->string('name', 100);
            $table->string('category', 20)->nullable();
            $table->string('position', 255)->collation('C');
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->index(['board_id', 'parent_id', 'position']);
        });

        // Ссылку на саму таблицу добавляем после создания первичного ключа
        Schema::table('board_columns', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('board_columns')->restrictOnDelete();
        });

        DB::statement(<<<'SQL'
            ALTER TABLE board_columns
                ADD CONSTRAINT board_columns_category_check
                    CHECK (category IN ('queue', 'in_progress', 'done')),
                ADD CONSTRAINT board_columns_category_on_top_level
                    CHECK ((parent_id IS NULL) = (category IS NOT NULL))
            SQL);

        Schema::create('lanes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('board_id')->constrained()->restrictOnDelete();
            $table->string('name', 100);
            $table->string('position', 255)->collation('C');
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->index(['board_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lanes');
        Schema::dropIfExists('board_columns');
        Schema::dropIfExists('boards');
    }
};
