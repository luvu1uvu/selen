-- Права роли приложения в текущей базе (docs/adr/0016-db-roles.md). Выполняет владелец схемы или суперпользователь;
-- повторный запуск безопасен. Нужен после создания базы, перевода на роли и после восстановления из бэкапа
-- (бэкап без прав: pg_dump --no-privileges).
--   psql -d selen -v owner=selen_owner -v app=selen_app -f grants.sql

SET client_min_messages = warning;

-- Схема: создавать объекты может только владелец
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app') \gexec

-- Данные: чтение и запись, без TRUNCATE, без владения (значит, без ALTER, DROP и отключения триггеров)
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app') \gexec

-- Таблицы и последовательности, которые миграции создадут позже
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
              :'owner', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
              :'owner', :'app') \gexec

-- История append-only (ADR-0003, ADR-0006, ADR-0011): только чтение и добавление; эпизод блокировки можно закрыть
-- (UPDATE), но не удалить. То же делает миграция restrict_app_role_on_history — для баз, созданных миграциями.
SELECT format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM %I', t, :'app')
  FROM unnest(ARRAY['event_log', 'card_transitions']) AS t
 WHERE to_regclass('public.' || t) IS NOT NULL \gexec
SELECT format('REVOKE DELETE, TRUNCATE ON card_blocks FROM %I', :'app')
 WHERE to_regclass('public.card_blocks') IS NOT NULL \gexec
-- Компании не удаляются (ADR-0024, В10) — то же делает миграция create_companies
SELECT format('REVOKE DELETE, TRUNCATE ON companies FROM %I', :'app')
 WHERE to_regclass('public.companies') IS NOT NULL \gexec
