<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name');
            // Email храним в нижнем регистре (мутатор в модели User)
            $table->string('email')->unique();
            // null, пока пользователь не принял приглашение
            $table->string('password')->nullable();
            $table->string('role', 16)->default('member');
            $table->string('status', 16)->default('invited');
            $table->string('timezone', 64)->default('Europe/Moscow');
            $table->timestampTz('last_login_at')->nullable();
            $table->timestampTz('deactivated_at')->nullable();
            $table->rememberToken();
            $table->timestampsTz();

            $table->index('status');
        });

        // Допустимые значения дублируем ограничениями БД — защита от ошибок вне приложения
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'))");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('invited', 'active', 'deactivated'))");

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestampTz('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignUlid('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
