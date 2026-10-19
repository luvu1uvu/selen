<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Приглашения не удаляются: это история того, кто, кого и когда пригласил.
        Schema::create('invitations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            // Email на момент приглашения (у пользователя он может измениться позже)
            $table->string('email');
            // sha256 от токена из ссылки; сам токен в БД не хранится
            $table->string('token_hash', 64)->unique();
            $table->foreignUlid('invited_by_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampTz('expires_at');
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('revoked_at')->nullable();
            // Приглашение заменено новым при повторной отправке
            $table->ulid('superseded_by_id')->nullable();
            $table->timestampsTz();

            $table->index(['user_id', 'created_at']);
        });

        // Ссылку на саму таблицу добавляем после создания первичного ключа
        Schema::table('invitations', function (Blueprint $table) {
            $table->foreign('superseded_by_id')->references('id')->on('invitations')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
