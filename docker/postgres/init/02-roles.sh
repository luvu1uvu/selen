#!/bin/sh
# Роли Selen на новом томе (docs/adr/0016-db-roles.md): владелец схемы и роль приложения, владение базами
# и права. Выполняется образом postgres один раз — при первой инициализации тома, после 01-testing-db.sql.
# Существующие тома переводит scripts/db-roles.sh (make db-roles, на стенде — make pm-update).
# Переменные SELEN_DB_* задаёт docker-compose (из .env); SQL — в /selen-sql (docker/postgres/sql).
set -eu

su_psql() { psql -v ON_ERROR_STOP=1 -q --username "$POSTGRES_USER" "$@"; }

su_psql -d "$POSTGRES_DB" -v owner="$SELEN_DB_OWNER" -v owner_password="$SELEN_DB_OWNER_PASSWORD" \
  -v app="$SELEN_DB_APP" -v app_password="$SELEN_DB_APP_PASSWORD" -f /selen-sql/roles.sql

for db in "$POSTGRES_DB" selen_testing; do
  if [ "$(su_psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$db'")" = "1" ]; then
    su_psql -d "$db" -v owner="$SELEN_DB_OWNER" -f /selen-sql/ownership.sql
    su_psql -d "$db" -v owner="$SELEN_DB_OWNER" -v app="$SELEN_DB_APP" -f /selen-sql/grants.sql
  fi
done
