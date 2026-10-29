<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * П2c-2: «последняя активность» в «Пользователях» и смена email администратором (LATER-9, решение PM 28.10).
 *
 * users.last_seen_at — время последнего запроса вошедшего пользователя, обновляется не чаще раза в несколько минут
 * (middleware TouchLastSeen, config selen.last_seen_interval_minutes). До неё активность не писалась — начальное значение
 * — время последнего входа: иначе давно не заходившие встали бы в сортировке вместе с теми, кто не входил никогда.
 *
 * email_change_requests — запрос смены email, который ждёт подтверждения по ссылке из письма на новый адрес: у человека
 * не больше одного. Подтверждение и отмена удаляют строку (история — события журнала, без адресов), просроченные удаляет
 * планировщик (model:prune): новый адрес — персональные данные, он хранится только пока ждёт подтверждения. Таблица не
 * append-only и без company_id: email — у учётной записи, а не у компании (компания запроса — в событии журнала).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestampTz('last_seen_at')->nullable();
            $table->index('last_seen_at');
        });
        DB::table('users')->whereNotNull('last_login_at')->update(['last_seen_at' => DB::raw('last_login_at')]);

        Schema::create('email_change_requests', function (Blueprint $table) {
            $table->foreignUlid('user_id')->primary()->constrained('users')->restrictOnDelete();
            // Новый адрес занят, пока ждёт подтверждения: два запроса на один адрес — нельзя
            $table->string('new_email')->unique();
            // sha256 токена из ссылки; сам токен — только в письме
            $table->string('token_hash', 64)->unique();
            $table->foreignUlid('requested_by_id')->constrained('users')->restrictOnDelete();
            $table->timestampTz('expires_at');
            $table->timestampTz('created_at');

            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_change_requests');

        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['last_seen_at']);
            $table->dropColumn('last_seen_at');
        });
    }
};
