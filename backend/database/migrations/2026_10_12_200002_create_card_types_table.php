<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Глобальный справочник типов карточек. Управляет системный администратор.
 * Предустановленные типы создаются здесь, а не в сидере: они нужны и в production.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_types', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 50)->unique();
            // Цвет метки на карточке, #rrggbb в нижнем регистре
            $table->char('color', 7);
            // Тип новых карточек по умолчанию — ровно один (частичный уникальный индекс ниже)
            $table->boolean('is_default')->default(false);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();
        });

        DB::statement("ALTER TABLE card_types ADD CONSTRAINT card_types_color_format CHECK (color ~ '^#[0-9a-f]{6}$')");
        DB::statement('CREATE UNIQUE INDEX card_types_single_default ON card_types (is_default) WHERE is_default');

        $now = Date::now();
        $presets = [
            ['name' => 'Задача', 'color' => '#3b82f6', 'is_default' => true],
            ['name' => 'Баг', 'color' => '#ef4444', 'is_default' => false],
            ['name' => 'История', 'color' => '#22c55e', 'is_default' => false],
            ['name' => 'Эпик', 'color' => '#a855f7', 'is_default' => false],
        ];

        foreach ($presets as $preset) {
            // ULID монотонны: порядок создания = порядок в справочнике
            DB::table('card_types')->insert($preset + [
                'id' => (string) Str::ulid(),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('card_types');
    }
};
