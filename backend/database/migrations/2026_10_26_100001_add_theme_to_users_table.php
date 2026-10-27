<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Тема оформления пользователя (docs/adr/0025-theme.md): «Светлая / Тёмная / Как в системе», по умолчанию светлая.
 * Это вид, а не доступ и не данные: копия — в браузере, в журнал событий смена темы не пишется (решение PM 26.10).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('theme', 16)->default('light');
        });

        DB::statement("ALTER TABLE users ADD CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark', 'system'))");
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('theme');
        });
    }
};
