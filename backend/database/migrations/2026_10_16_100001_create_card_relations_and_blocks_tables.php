<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Связи и блокировки карточек (этап 2c).
 *
 * card_relations — родитель и дочерняя в одном пространстве; у карточки может быть несколько родителей.
 * card_blocks — эпизоды блокировки (docs/adr/0011-card-blocks.md): строка не перезаписывается,
 * разрешено только закрыть эпизод; удаление запрещено.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_relations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('parent_id')->constrained('cards')->restrictOnDelete();
            $table->foreignUlid('child_id')->constrained('cards')->restrictOnDelete();
            $table->foreignUlid('created_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->unique(['parent_id', 'child_id']);
            $table->index('child_id');
        });

        Schema::create('card_blocks', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('card_id')->constrained('cards')->restrictOnDelete();
            // Причина — блокирующая карточка и/или текст (хотя бы одно)
            $table->foreignUlid('blocking_card_id')->nullable()->constrained('cards')->restrictOnDelete();
            $table->text('reason')->nullable();
            $table->timestampTz('started_at', 6);
            $table->foreignUlid('started_by')->constrained('users')->restrictOnDelete();
            // Конец эпизода; ended_by = null — сняла система (консоль)
            $table->timestampTz('ended_at', 6)->nullable();
            $table->foreignUlid('ended_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('end_reason', 30)->nullable();

            $table->index(['card_id', 'started_at']);
        });

        DB::unprepared(<<<'SQL'
            ALTER TABLE card_relations
                ADD CONSTRAINT card_relations_not_self CHECK (parent_id <> child_id);

            ALTER TABLE card_blocks
                ADD CONSTRAINT card_blocks_has_cause CHECK (blocking_card_id IS NOT NULL OR reason IS NOT NULL),
                ADD CONSTRAINT card_blocks_not_self CHECK (blocking_card_id IS NULL OR blocking_card_id <> card_id),
                ADD CONSTRAINT card_blocks_end_reason CHECK (end_reason IN ('manual', 'blocker_completed')),
                ADD CONSTRAINT card_blocks_end_consistent CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
                ADD CONSTRAINT card_blocks_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at),
                ADD CONSTRAINT card_blocks_completed_has_blocker
                    CHECK (end_reason IS DISTINCT FROM 'blocker_completed' OR blocking_card_id IS NOT NULL);

            -- Одна активная блокировка на пару карточек; поиск активных блокировок по блокирующей (автоснятие)
            CREATE UNIQUE INDEX card_blocks_active_pair ON card_blocks (card_id, blocking_card_id)
                WHERE ended_at IS NULL AND blocking_card_id IS NOT NULL;
            CREATE INDEX card_blocks_active_by_blocker ON card_blocks (blocking_card_id) WHERE ended_at IS NULL;
            CREATE INDEX card_blocks_active ON card_blocks (card_id) WHERE ended_at IS NULL;

            -- Единственное разрешённое изменение — закрыть открытый эпизод (ended_* из NULL в значение)
            CREATE OR REPLACE FUNCTION card_blocks_only_close() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
                   OR (NEW.id, NEW.card_id, NEW.blocking_card_id, NEW.reason, NEW.started_at, NEW.started_by)
                      IS DISTINCT FROM (OLD.id, OLD.card_id, OLD.blocking_card_id, OLD.reason, OLD.started_at, OLD.started_by)
                THEN
                    RAISE EXCEPTION 'card_blocks: only closing an open block is allowed'
                        USING ERRCODE = 'restrict_violation';
                END IF;
                RETURN NEW;
            END;
            $$;

            CREATE TRIGGER card_blocks_only_close
                BEFORE UPDATE ON card_blocks
                FOR EACH ROW EXECUTE FUNCTION card_blocks_only_close();

            -- Удаление и TRUNCATE — как у card_transitions (функция из миграции этапа 1)
            CREATE TRIGGER card_blocks_no_delete
                BEFORE DELETE OR TRUNCATE ON card_blocks
                FOR EACH STATEMENT EXECUTE FUNCTION forbid_append_only_modification();
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('card_blocks');
        Schema::dropIfExists('card_relations');
        DB::unprepared('DROP FUNCTION IF EXISTS card_blocks_only_close()');
    }
};
