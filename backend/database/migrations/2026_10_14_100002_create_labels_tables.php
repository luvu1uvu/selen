<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Метки карточек — гибрид: общие метки компании (space_id = null, ведёт системный администратор)
 * и метки пространства (ведёт администратор пространства). Не удаляются — архивируются:
 * архивную метку нельзя поставить, но на карточках она остаётся.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('labels', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('space_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('name', 50);
            $table->char('color', 7);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();

            $table->index('space_id');
        });

        DB::statement("ALTER TABLE labels ADD CONSTRAINT labels_color_format CHECK (color ~ '^#[0-9a-f]{6}$')");
        // Название уникально среди активных меток своего набора (без учёта регистра)
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX labels_active_name_unique
                ON labels (COALESCE(space_id, ''), lower(name))
                WHERE archived_at IS NULL
            SQL);

        Schema::create('card_labels', function (Blueprint $table) {
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('label_id')->constrained()->restrictOnDelete();

            $table->primary(['card_id', 'label_id']);
            $table->index('label_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_labels');
        Schema::dropIfExists('labels');
    }
};
