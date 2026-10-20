<?php

use App\Support\FractionalIndex;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Раскладка досок пространства рядами (docs/adr/0019-board-and-space-layout.md): в ряду доски стоят рядом, ряды — друг
 * под другом. Раскладка общая для всех. Ряд — служебная запись раскладки, не данные: ряд, где не осталось ни одной доски
 * (ни активной, ни архивной), удаляет действие перестановки. boards.position — порядок внутри ряда.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('board_rows', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            // Дробные ключи порядка рядов в пространстве (ADR-0007)
            $table->string('position', 255)->collation('C');

            $table->index(['space_id', 'position']);
        });

        Schema::table('boards', function (Blueprint $table) {
            $table->foreignUlid('row_id')->nullable()->after('space_id')->constrained('board_rows')->restrictOnDelete();
            $table->index(['row_id', 'position']);
        });

        // Каждая существующая доска — в свой ряд, в прежнем порядке: раскладка выглядит как раньше, «друг под другом»
        foreach (DB::table('boards')->distinct()->pluck('space_id') as $spaceId) {
            $boards = DB::table('boards')->where('space_id', $spaceId)->orderBy('position')->pluck('id');
            $positions = FractionalIndex::nBetween(null, null, $boards->count());
            foreach ($boards as $i => $boardId) {
                $rowId = strtolower((string) Str::ulid());
                DB::table('board_rows')->insert(['id' => $rowId, 'space_id' => $spaceId, 'position' => $positions[$i]]);
                DB::table('boards')->where('id', $boardId)->update(['row_id' => $rowId]);
            }
        }

        DB::statement('ALTER TABLE boards ALTER COLUMN row_id SET NOT NULL');
    }

    public function down(): void
    {
        Schema::table('boards', function (Blueprint $table) {
            $table->dropConstrainedForeignId('row_id');
        });
        Schema::dropIfExists('board_rows');
    }
};
