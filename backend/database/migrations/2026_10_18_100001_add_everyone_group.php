<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Встроенная группа «Все сотрудники» (docs/adr/0012-groups.md, «Изменения»).
 * Её состав не хранится в group_members: в неё входит каждый активный пользователь, членство вычисляет
 * App\Services\Access\SpaceAccessResolver. Архивировать, переименовать и менять состав нельзя.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('groups', function (Blueprint $table) {
            // null — обычная группа; иначе — встроенная (пока одна: everyone)
            $table->string('system_key', 30)->nullable()->unique();
        });

        DB::statement("ALTER TABLE groups ADD CONSTRAINT groups_system_key_check CHECK (system_key IN ('everyone'))");
        // Встроенная группа не архивируется
        DB::statement('ALTER TABLE groups ADD CONSTRAINT groups_system_not_archived CHECK (system_key IS NULL OR archived_at IS NULL)');

        // Название уникально без учёта регистра: если такая группа уже заведена вручную — переименовываем её
        DB::table('groups')
            ->whereRaw('lower(name) = lower(?)', ['Все сотрудники'])
            ->update(['name' => 'Все сотрудники (вручную)']);

        DB::table('groups')->insert([
            'id' => strtolower((string) Str::ulid()),
            'name' => 'Все сотрудники',
            'description' => 'Встроенная группа: в неё автоматически входят все активные сотрудники.',
            'system_key' => 'everyone',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('space_groups')
            ->whereIn('group_id', DB::table('groups')->select('id')->whereNotNull('system_key'))
            ->delete();
        DB::table('groups')->whereNotNull('system_key')->delete();

        Schema::table('groups', function (Blueprint $table) {
            $table->dropColumn('system_key');
        });
    }
};
