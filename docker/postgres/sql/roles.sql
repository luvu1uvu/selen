-- Роли Selen (docs/adr/0016-db-roles.md). Выполняет суперпользователь; повторный запуск безопасен.
--   psql -v owner=selen_owner -v owner_password=… -v app=selen_app -v app_password=… -f roles.sql
--
-- owner — владелец схемы: миграции, бэкап и восстановление (CREATEDB — пересоздать базу при восстановлении,
--         pg_signal_backend — закрыть подключения приложения перед этим). Не суперпользователь.
-- app   — роль приложения (веб, очереди, scheduler): только чтение и запись данных, ничем не владеет.

SET client_min_messages = warning;

SELECT format('CREATE ROLE %I', :'owner') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'owner') \gexec
SELECT format('CREATE ROLE %I', :'app') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app') \gexec

SELECT format('ALTER ROLE %I LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
              :'owner', :'owner_password') \gexec
SELECT format('ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
              :'app', :'app_password') \gexec

SELECT format('GRANT pg_signal_backend TO %I', :'owner') \gexec
