<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Личное сворачивание дорожек (docs/adr/0019-board-and-space-layout.md): есть строка — дорожка у пользователя свёрнута.
 * Это вид, а не доступ и не данные: читается только в ответе доски, в журнал событий не пишется. Удаление дорожки
 * (вместе с пустым пространством) уносит и её строки.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collapsed_lanes', function (Blueprint $table) {
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('lane_id')->constrained()->cascadeOnDelete();

            $table->primary(['user_id', 'lane_id']);
            $table->index('lane_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collapsed_lanes');
    }
};
