<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Корзина карточек (LATER-45, docs/adr/0015-card-trash.md): удаление мягкое — deleted_at и deleted_by.
 * Физически карточки не удаляются, триггеры append-only (card_transitions, card_blocks, event_log) не меняются.
 *
 * - Уникальность позиций в ячейке — только среди карточек на доске: удалённая карточка свою позицию не держит
 *   (при восстановлении встаёт в конец ячейки, как из архива).
 * - Блокировка, где блокирующую карточку удалили, закрывается с end_reason = blocker_deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cards', function (Blueprint $table) {
            $table->timestampTz('deleted_at')->nullable();
            $table->foreignUlid('deleted_by')->nullable()->constrained('users')->restrictOnDelete();
        });

        DB::unprepared(<<<'SQL'
            CREATE INDEX cards_trash ON cards (deleted_at DESC) WHERE deleted_at IS NOT NULL;
            ALTER TABLE cards ADD CONSTRAINT cards_deleted_consistent CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

            DROP INDEX cards_cell_position_unique;
            CREATE UNIQUE INDEX cards_cell_position_unique
                ON cards (column_id, lane_id, position)
                WHERE archived_at IS NULL AND deleted_at IS NULL;

            ALTER TABLE card_blocks
                DROP CONSTRAINT card_blocks_end_reason,
                ADD CONSTRAINT card_blocks_end_reason CHECK (end_reason IN ('manual', 'blocker_completed', 'blocker_deleted')),
                ADD CONSTRAINT card_blocks_deleted_has_blocker
                    CHECK (end_reason IS DISTINCT FROM 'blocker_deleted' OR blocking_card_id IS NOT NULL);
            SQL);
    }

    /** Откат возможен, только пока нет блокировок, снятых с причиной blocker_deleted (их не изменить — append-only). */
    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            ALTER TABLE card_blocks
                DROP CONSTRAINT card_blocks_deleted_has_blocker,
                DROP CONSTRAINT card_blocks_end_reason,
                ADD CONSTRAINT card_blocks_end_reason CHECK (end_reason IN ('manual', 'blocker_completed'));

            DROP INDEX cards_cell_position_unique;
            CREATE UNIQUE INDEX cards_cell_position_unique
                ON cards (column_id, lane_id, position)
                WHERE archived_at IS NULL;

            ALTER TABLE cards DROP CONSTRAINT cards_deleted_consistent;
            DROP INDEX cards_trash;
            SQL);

        Schema::table('cards', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropColumn('deleted_at');
        });
    }
};
