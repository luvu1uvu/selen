<?php

use App\Support\FractionalIndex;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Дерево навигации: папки и элементы (сейчас — пространства, позже — документы), docs/adr/0013-navigation-tree.md.
 * Папки не влияют на доступ: доступ — только к пространствам (ADR-0012). Новый тип элемента — новый type
 * и ссылка на свою таблицу, без переделки дерева.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nav_nodes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            // null — корень дерева; родитель — только папка (проверяет MoveNavNodeAction)
            $table->ulid('parent_id')->nullable();
            $table->string('type', 20);
            // Название — только у папки; у пространства своё spaces.name
            $table->string('name', 100)->nullable();
            // Иконка-эмодзи (необязательна) — у папки и у пространства
            $table->string('icon', 32)->nullable();
            $table->foreignUlid('space_id')->nullable()->unique()->constrained()->restrictOnDelete();
            // Дробные ключи порядка внутри родителя (ADR-0007)
            $table->string('position', 255)->collation('C');
            // Архив — только у папки; у пространства своё spaces.archived_at
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->index(['parent_id', 'position']);
        });

        // Ссылку на саму таблицу добавляем после создания первичного ключа
        Schema::table('nav_nodes', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('nav_nodes')->restrictOnDelete();
        });

        DB::statement("ALTER TABLE nav_nodes ADD CONSTRAINT nav_nodes_type_check CHECK (type IN ('folder', 'space'))");
        DB::statement(<<<'SQL'
            ALTER TABLE nav_nodes ADD CONSTRAINT nav_nodes_type_fields CHECK (
                (type = 'folder' AND name IS NOT NULL AND space_id IS NULL)
                OR (type = 'space' AND space_id IS NOT NULL AND name IS NULL AND archived_at IS NULL)
            )
            SQL);

        // Каждому существующему пространству — узел в корне, по названию
        $position = null;
        $now = now();
        foreach (DB::table('spaces')->orderByRaw('lower(name)')->orderBy('key')->pluck('id') as $spaceId) {
            $position = FractionalIndex::between($position, null);
            DB::table('nav_nodes')->insert([
                'id' => strtolower((string) Str::ulid()),
                'type' => 'space',
                'space_id' => $spaceId,
                'position' => $position,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('nav_nodes');
    }
};
