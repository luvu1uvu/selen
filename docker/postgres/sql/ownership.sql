-- Передать владение базой и всеми объектами схемы public роли owner (docs/adr/0016-db-roles.md).
-- Для баз, созданных до ролей (владелец — суперпользователь образа). Выполняет суперпользователь в нужной базе;
-- повторный запуск безопасен.
--   psql -d selen -v owner=selen_owner -f ownership.sql

SET client_min_messages = warning;

SELECT format('ALTER DATABASE %I OWNER TO %I', current_database(), :'owner') \gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'owner') \gexec

-- Таблицы, представления и самостоятельные последовательности (последовательности столбцов serial и identity
-- переходят вместе со своей таблицей)
SELECT format('ALTER %s %I.%I OWNER TO %I',
              CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
              n.nspname, c.relname, :'owner')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
   AND pg_get_userbyid(c.relowner) <> :'owner'
   AND NOT (c.relkind = 'S' AND EXISTS (
         SELECT FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
 ORDER BY c.relkind = 'S', c.relname \gexec

-- Функции (триггеры append-only) и самостоятельные типы
SELECT format('ALTER FUNCTION %s OWNER TO %I', p.oid::regprocedure, :'owner')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> :'owner' \gexec
SELECT format('ALTER %s %I.%I OWNER TO %I', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, n.nspname, t.typname, :'owner')
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd') AND pg_get_userbyid(t.typowner) <> :'owner' \gexec
