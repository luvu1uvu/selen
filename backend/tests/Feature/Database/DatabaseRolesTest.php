<?php

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Роли базы (docs/adr/0016-db-roles.md). Тесты, как веб и очереди, работают под ролью приложения: только чтение
| и запись данных, ничем не владеет. Изменить или удалить историю, отключить триггеры, изменить схему —
| ошибка прав (SQLSTATE 42501) ещё до триггеров. Триггеры append-only — второй рубеж: они на месте и включены.
*/

/** Ошибка прав внутри савепойнта: транзакция теста остаётся рабочей. */
function expectPermissionDenied(string $sql): void
{
    expect(fn () => DB::transaction(fn () => DB::statement($sql)))
        ->toThrow(fn (QueryException $e) => expect($e->getCode())->toBe('42501', "{$sql}: {$e->getMessage()}"));
}

it('приложение и тесты работают под ролью приложения: не суперпользователь, не владелец, не создаёт объекты', function () {
    $role = DB::selectOne(<<<'SQL'
        SELECT current_user AS name, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
               has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
               (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owned,
               (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()) AS db_owner
          FROM pg_roles r WHERE r.rolname = current_user
        SQL);

    expect($role->name)->toBe(config('database.connections.pgsql.username'))
        ->and($role->name)->not->toBe(config('database.connections.pgsql_owner.username'))
        ->and($role->rolsuper)->toBeFalse()
        ->and($role->rolcreatedb)->toBeFalse()
        ->and($role->rolcreaterole)->toBeFalse()
        ->and($role->rolbypassrls)->toBeFalse()
        ->and($role->can_create)->toBeFalse()
        ->and($role->owned)->toBe(0)
        ->and($role->db_owner)->toBe(config('database.connections.pgsql_owner.username'));
});

it('историю нельзя изменить, удалить или очистить — ошибка прав', function (string $sql) {
    expectPermissionDenied($sql);
})->with([
    'журнал: UPDATE' => ["UPDATE event_log SET event_type = 'tampered'"],
    'журнал: DELETE' => ['DELETE FROM event_log'],
    'журнал: TRUNCATE' => ['TRUNCATE event_log CASCADE'],
    'переходы: UPDATE' => ["UPDATE card_transitions SET reason = 'manual'"],
    'переходы: DELETE' => ['DELETE FROM card_transitions'],
    'переходы: TRUNCATE' => ['TRUNCATE card_transitions'],
    'блокировки: DELETE' => ['DELETE FROM card_blocks'],
    'блокировки: TRUNCATE' => ['TRUNCATE card_blocks'],
]);

it('триггеры нельзя отключить или подменить, схему — изменить; обхода через параметры нет — ошибка прав', function (string $sql) {
    expectPermissionDenied($sql);
})->with([
    'отключить триггеры журнала' => ['ALTER TABLE event_log DISABLE TRIGGER ALL'],
    'отключить триггер переходов' => ['ALTER TABLE card_transitions DISABLE TRIGGER card_transitions_append_only'],
    'удалить триггер блокировок' => ['DROP TRIGGER card_blocks_no_delete ON card_blocks'],
    'удалить функцию триггера' => ['DROP FUNCTION forbid_append_only_modification() CASCADE'],
    'подменить функцию триггера' => ['CREATE OR REPLACE FUNCTION forbid_append_only_modification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$'],
    'режим репликации без триггеров' => ["SET session_replication_role = 'replica'"],
    'сменить владельца' => ['ALTER TABLE event_log OWNER TO CURRENT_USER'],
    'создать таблицу' => ['CREATE TABLE tampered (id int)'],
    'изменить таблицу' => ['ALTER TABLE cards ADD COLUMN tampered int'],
    'удалить таблицу' => ['DROP TABLE cards CASCADE'],
]);

it('нужные приложению права есть: данные, добавление в историю, закрытие эпизода блокировки', function () {
    $privilege = fn (string $table, string $privilege) => DB::selectOne(
        'SELECT has_table_privilege(current_user, ?, ?) AS allowed', [$table, $privilege],
    )->allowed;

    foreach (['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as $p) {
        expect($privilege('cards', $p))->toBeTrue("cards {$p}");
    }
    foreach (['event_log', 'card_transitions', 'card_blocks'] as $table) {
        expect($privilege($table, 'SELECT'))->toBeTrue("{$table} SELECT")
            ->and($privilege($table, 'INSERT'))->toBeTrue("{$table} INSERT");
    }
    expect($privilege('card_blocks', 'UPDATE'))->toBeTrue();
});

it('триггеры append-only на месте и включены — второй рубеж под владельцем схемы', function () {
    $triggers = collect(DB::select(<<<'SQL'
        SELECT tgname, tgenabled FROM pg_trigger
         WHERE tgname IN ('event_log_append_only', 'card_transitions_append_only', 'card_blocks_no_delete', 'card_blocks_only_close')
        SQL))->pluck('tgenabled', 'tgname')->sortKeys()->all();

    expect($triggers)->toBe([
        'card_blocks_no_delete' => 'O',
        'card_blocks_only_close' => 'O',
        'card_transitions_append_only' => 'O',
        'event_log_append_only' => 'O',
    ]);

    // Владелец схемы права на DELETE имеет, но его останавливает триггер
    expect(fn () => asOwner('DELETE FROM card_blocks'))->toThrow(QueryException::class, 'append-only')
        ->and(fn () => asOwner('TRUNCATE card_transitions'))->toThrow(QueryException::class, 'append-only');
});
