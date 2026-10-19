<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Журнал событий — append-only. Обоснование и правила — docs/adr/0003-event-log.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('event_log', function (Blueprint $table) {
            // bigint identity: строгий порядок вставки, компактный индекс
            $table->id();
            // Время факта (задаёт приложение), микросекундная точность
            $table->timestampTz('occurred_at', 6);
            $table->string('event_type', 100);
            // null — действие системы (консоль, планировщик) или анонимное (неудачный вход)
            $table->foreignUlid('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            // Morph alias (user, invitation, позже card) и id объекта
            $table->string('subject_type', 50)->nullable();
            $table->string('subject_id', 64)->nullable();
            // Доменные данные события: самодостаточный снимок (from/to и т. п.)
            $table->jsonb('payload')->default('{}');
            // Технический контекст: ip, user_agent, источник
            $table->jsonb('meta')->default('{}');

            $table->index(['subject_type', 'subject_id', 'occurred_at']);
            $table->index(['event_type', 'occurred_at']);
            $table->index(['actor_id', 'occurred_at']);
        });

        // Защита на уровне БД: UPDATE, DELETE и TRUNCATE запрещены для любого клиента.
        // Триггер уровня STATEMENT срабатывает даже если запрос не затрагивает ни одной строки.
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION event_log_forbid_modification() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'event_log is append-only: % is not allowed', TG_OP
                    USING ERRCODE = 'restrict_violation';
            END;
            $$;

            CREATE TRIGGER event_log_append_only
                BEFORE UPDATE OR DELETE OR TRUNCATE ON event_log
                FOR EACH STATEMENT EXECUTE FUNCTION event_log_forbid_modification();
            SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('event_log');
        DB::unprepared('DROP FUNCTION IF EXISTS event_log_forbid_modification()');
    }
};
