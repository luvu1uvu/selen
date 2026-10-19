<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Системная роль «Владелец» (docs/adr/0017-owner-role.md). Ограничения БД — страховка: основной механизм —
 * политики и Actions (403/422). Владелец ровно один с момента назначения:
 * - не больше одного — уникальный частичный индекс;
 * - всегда активен — CHECK;
 * - не пропадает — отложенный триггер: снять роль можно, только если к концу транзакции есть новый Владелец
 *   (передача владения меняет обе строки в одной транзакции).
 * Существующим данным Владельцем назначается самый ранний активный администратор.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'member'))");
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_owner_active CHECK (role <> 'owner' OR status = 'active')");
        DB::statement("CREATE UNIQUE INDEX users_single_owner ON users ((true)) WHERE role = 'owner'");

        // OR REPLACE: migrate:fresh удаляет таблицы, но не функции (как у триггеров append-only)
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION users_owner_kept() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner') THEN
                    RAISE EXCEPTION 'users: the owner role can only be handed over, not removed'
                        USING ERRCODE = 'check_violation';
                END IF;
                RETURN NULL;
            END;
            $$;

            CREATE CONSTRAINT TRIGGER users_owner_kept
                AFTER UPDATE OF role OR DELETE ON users
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW WHEN (OLD.role = 'owner')
                EXECUTE FUNCTION users_owner_kept();
            SQL);

        $this->assignFirstOwner();
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS users_owner_kept ON users; DROP FUNCTION IF EXISTS users_owner_kept()');
        DB::statement('DROP INDEX IF EXISTS users_single_owner');
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_owner_active');
        DB::table('users')->where('role', 'owner')->update(['role' => 'admin']);
        DB::statement('ALTER TABLE users DROP CONSTRAINT users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member'))");
    }

    /**
     * Владелец — самый ранний по дате создания активный администратор, если Владельца ещё нет (публичный —
     * для теста). Событие пишется сырым insert, как прочие миграции, без кода приложения; формат — как
     * у EventRecorder (ADR-0003): только id, источник — console.
     */
    public function assignFirstOwner(): void
    {
        if (DB::table('users')->where('role', 'owner')->exists()) {
            return;
        }

        $id = DB::table('users')
            ->where('role', 'admin')
            ->where('status', 'active')
            ->orderBy('created_at')
            ->orderBy('id')
            ->value('id');
        if ($id === null) {
            return;
        }

        $now = Date::now();
        DB::table('users')->where('id', $id)->update(['role' => 'owner', 'updated_at' => $now]);
        DB::table('event_log')->insert([
            'occurred_at' => $now,
            'event_type' => 'user.ownership_transferred',
            'actor_id' => null,
            'subject_type' => 'user',
            'subject_id' => $id,
            'payload' => json_encode(['from_user_id' => null, 'to_user_id' => $id, 'via' => 'migration']),
            'meta' => json_encode(['source' => 'console']),
        ]);
    }
};
