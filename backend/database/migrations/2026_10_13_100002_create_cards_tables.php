<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Карточки и история их перемещений.
 *
 * card_transitions — append-only (как event_log): модель запрещает изменение и удаление,
 * триггер PostgreSQL — UPDATE/DELETE/TRUNCATE. Источник истины для метрик потока —
 * docs/adr/0006-card-transitions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cards', function (Blueprint $table) {
            $table->ulid('id')->primary();
            // Пространство карточки не меняется (перенос между пространствами вне scope)
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            // Номер внутри пространства: DEV-<number>. Выдаётся счётчиком spaces.last_card_number
            $table->unsignedInteger('number');
            $table->foreignUlid('board_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('column_id')->constrained('board_columns')->restrictOnDelete();
            $table->foreignUlid('lane_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('card_type_id')->constrained()->restrictOnDelete();
            $table->string('title', 500);
            $table->text('description')->nullable();
            $table->string('position', 255)->collation('C');
            $table->foreignUlid('created_by')->constrained('users')->restrictOnDelete();
            // Денормализация из card_transitions (источник истины — переходы)
            $table->timestampTz('first_started_at', 6)->nullable();
            $table->timestampTz('completed_at', 6)->nullable();
            $table->timestampTz('archived_at')->nullable();
            // Время создания совпадает с moved_at перехода «created» — с микросекундами
            $table->timestampsTz(6);

            $table->unique(['space_id', 'number']);
            $table->index(['board_id', 'archived_at']);
        });

        // Внутри ячейки позиции активных карточек уникальны (страховка от гонок поверх блокировки ячейки)
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX cards_cell_position_unique
                ON cards (column_id, lane_id, position)
                WHERE archived_at IS NULL
            SQL);

        Schema::create('card_transitions', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('space_id')->constrained()->restrictOnDelete();
            // from_* = null — создание карточки
            $table->foreignUlid('from_board_id')->nullable()->constrained('boards')->restrictOnDelete();
            $table->foreignUlid('to_board_id')->constrained('boards')->restrictOnDelete();
            $table->foreignUlid('from_column_id')->nullable()->constrained('board_columns')->restrictOnDelete();
            $table->foreignUlid('to_column_id')->constrained('board_columns')->restrictOnDelete();
            $table->foreignUlid('from_lane_id')->nullable()->constrained('lanes')->restrictOnDelete();
            $table->foreignUlid('to_lane_id')->constrained('lanes')->restrictOnDelete();
            // Категория колонки первого уровня НА МОМЕНТ перемещения (снимок, не ссылка)
            $table->string('from_category', 20)->nullable();
            $table->string('to_category', 20);
            $table->timestampTz('moved_at', 6);
            // null — действие системы
            $table->foreignUlid('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('reason', 30);

            $table->index(['card_id', 'moved_at', 'id']);
            $table->index(['space_id', 'moved_at']);
            $table->index(['to_column_id', 'moved_at']);
            $table->index(['from_column_id', 'moved_at']);
        });

        DB::statement(<<<'SQL'
            ALTER TABLE card_transitions
                ADD CONSTRAINT card_transitions_category_check
                    CHECK (to_category IN ('queue', 'in_progress', 'done')
                       AND (from_category IS NULL OR from_category IN ('queue', 'in_progress', 'done'))),
                ADD CONSTRAINT card_transitions_reason_check
                    CHECK (reason IN ('created', 'manual', 'column_type_changed', 'column_split')),
                ADD CONSTRAINT card_transitions_created_has_no_origin
                    CHECK ((reason = 'created') = (from_column_id IS NULL))
            SQL);

        // Общая функция для append-only таблиц: в сообщении — имя таблицы.
        // (event_log использует свою функцию из миграции этапа 0 — смёрженные миграции не меняем.)
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION forbid_append_only_modification() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
                    USING ERRCODE = 'restrict_violation';
            END;
            $$;

            CREATE TRIGGER card_transitions_append_only
                BEFORE UPDATE OR DELETE OR TRUNCATE ON card_transitions
                FOR EACH STATEMENT EXECUTE FUNCTION forbid_append_only_modification();
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('card_transitions');
        Schema::dropIfExists('cards');
        DB::unprepared('DROP FUNCTION IF EXISTS forbid_append_only_modification()');
    }
};
