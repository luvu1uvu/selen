<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Роль приложения (docs/adr/0016-db-roles.md) получает права на новые таблицы через ALTER DEFAULT PRIVILEGES —
 * в том числе UPDATE и DELETE. История append-only (ADR-0003, ADR-0006, ADR-0011) ей нужна только для чтения
 * и добавления; эпизод блокировки она закрывает (UPDATE), но не удаляет. Отзываем лишнее: попытка изменить или
 * удалить историю под ролью приложения — ошибка прав, ещё до триггеров. То же для восстановленных из бэкапа баз
 * делает docker/postgres/sql/grants.sql.
 *
 * Миграции выполняет владелец схемы (--database=pgsql_owner); роль приложения — из DB_USERNAME. Если её нет
 * или приложение работает под тем же владельцем, отзывать нечего.
 */
return new class extends Migration
{
    public function up(): void
    {
        $app = $this->appRole();
        if ($app === null) {
            return;
        }

        DB::statement("REVOKE UPDATE, DELETE, TRUNCATE ON event_log, card_transitions FROM {$app}");
        DB::statement("REVOKE DELETE, TRUNCATE ON card_blocks FROM {$app}");
    }

    public function down(): void
    {
        $app = $this->appRole();
        if ($app === null) {
            return;
        }

        DB::statement("GRANT UPDATE, DELETE ON event_log, card_transitions, card_blocks TO {$app}");
    }

    /** Имя роли приложения в кавычках SQL или null, если отдельной роли нет. */
    private function appRole(): ?string
    {
        $role = (string) config('database.connections.pgsql.username');
        $exists = DB::selectOne('SELECT 1 AS found FROM pg_roles WHERE rolname = ? AND rolname <> current_user', [$role]);

        return $exists === null ? null : DB::getQueryGrammar()->wrap($role);
    }
};
