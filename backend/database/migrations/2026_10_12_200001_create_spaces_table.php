<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Пространства и их участники. Модель доступа — docs/adr/0005-space-access.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Пространства не удаляются — только архивируются.
        Schema::create('spaces', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 100);
            // Префикс номеров карточек (DEV-123). Не меняется после создания: на него ведут ссылки.
            $table->string('key', 10)->unique();
            $table->text('description')->nullable();
            // Счётчик номеров карточек: только растёт, номера не переиспользуются
            $table->unsignedInteger('last_card_number')->default(0);
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();
        });

        DB::statement("ALTER TABLE spaces ADD CONSTRAINT spaces_key_format CHECK (key ~ '^[A-Z]{2,10}$')");

        // Участники пространства и их роли. Строка удаляется при исключении из пространства
        // (это доступ, а не пользователь); история — в журнале событий.
        Schema::create('space_members', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->timestampsTz();

            $table->unique(['space_id', 'user_id']);
            $table->index('user_id');
        });

        DB::statement("ALTER TABLE space_members ADD CONSTRAINT space_members_role_check CHECK (role IN ('admin', 'editor', 'commenter'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('space_members');
        Schema::dropIfExists('spaces');
    }
};
