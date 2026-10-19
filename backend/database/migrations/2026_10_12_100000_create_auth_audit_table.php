<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Технический аудит входов: IP и user agent событий аутентификации.
 *
 * В отличие от event_log таблица НЕ append-only: это персональные данные, они хранятся
 * ограниченный срок (config selen.auth_audit.retention_months) и удаляются планировщиком
 * (model:prune). Обоснование — docs/adr/0003-event-log.md, раздел «Персональные данные».
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auth_audit', function (Blueprint $table) {
            $table->id();
            $table->timestampTz('occurred_at', 6);
            // Событие журнала, к которому относится запись (тот же тип, то же время)
            $table->foreignId('event_log_id')->nullable()->constrained('event_log')->restrictOnDelete();
            $table->string('event_type', 100);
            // Чей вход: актор или пользователь-объект события (null — неизвестный email)
            $table->foreignUlid('user_id')->nullable()->constrained('users')->restrictOnDelete();
            // Введённый email — только если пользователь с таким адресом не найден
            $table->string('email_attempted')->nullable();
            $table->ipAddress('ip')->nullable();
            $table->string('user_agent')->nullable();

            $table->index('occurred_at');
            $table->index(['user_id', 'occurred_at']);
            $table->unique('event_log_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_audit');
    }
};
