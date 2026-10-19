<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Группы пользователей и их доступ к пространствам (docs/adr/0012-groups.md).
 * Группа — ещё один источник доступа рядом с личным участием (space_members). Итоговые права
 * вычисляет только App\Services\Access\SpaceAccessResolver.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Группы не удаляются — только архивируются: архивная группа доступа не даёт,
        // но состав и доступы сохраняются (восстановление возвращает всё как было).
        Schema::create('groups', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->timestampTz('archived_at')->nullable();
            $table->timestampsTz();
        });

        // Название уникально среди всех групп, включая архивные (без учёта регистра)
        DB::statement('CREATE UNIQUE INDEX groups_name_unique ON groups (lower(name))');

        // Состав группы. Деактивированный пользователь остаётся в группе, но доступа через неё не получает.
        Schema::create('group_members', function (Blueprint $table) {
            $table->foreignUlid('group_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('added_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->primary(['group_id', 'user_id']);
            $table->index('user_id');
        });

        // Доступ группы к пространству — как строка space_members, только для всей группы.
        // Строка удаляется при отзыве доступа (это доступ, а не группа); история — в журнале.
        Schema::create('space_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('group_id')->constrained()->restrictOnDelete();
            $table->string('role', 20);
            $table->boolean('own_cards_only')->default(false);
            $table->timestampsTz();

            $table->unique(['space_id', 'group_id']);
            $table->index('group_id');
        });

        DB::statement("ALTER TABLE space_groups ADD CONSTRAINT space_groups_role_check CHECK (role IN ('admin', 'editor', 'commenter'))");
        // Администратор видит всё — режим «только свои карточки» к нему неприменим (как у space_members, ADR-0008)
        DB::statement("ALTER TABLE space_groups ADD CONSTRAINT space_groups_admin_not_restricted CHECK (NOT (role = 'admin' AND own_cards_only))");
    }

    public function down(): void
    {
        Schema::dropIfExists('space_groups');
        Schema::dropIfExists('group_members');
        Schema::dropIfExists('groups');
    }
};
