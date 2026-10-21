<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Личное сворачивание досок на странице пространства (docs/adr/0019-board-and-space-layout.md): есть строка — доска
 * у пользователя свёрнута. Это вид, а не доступ и не данные: читается только в списке досок пространства, в журнал
 * событий не пишется. Удаление доски (вместе с пустым пространством) уносит и её строки.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collapsed_boards', function (Blueprint $table) {
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('board_id')->constrained()->cascadeOnDelete();

            $table->primary(['user_id', 'board_id']);
            $table->index('board_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collapsed_boards');
    }
};
