#!/usr/bin/env bash
# Перевод базы на роли (docs/adr/0016-db-roles.md): selen_owner — владелец схемы (миграции, бэкап и восстановление),
# selen_app — приложение (только данные), суперпользователь образа — только этот перевод.
#
#   make db-roles      — dev (основная копия); затем контейнеры перезапускаются с новым .env
#   make pm-update     — стенд PM: вызывает этот скрипт из своей рабочей копии сам
#
# Повторный запуск безопасен: что уже сделано — пропускается. Данные не меняются: только .env, роли,
# владельцы объектов и права.
#   1. .env: до ролей приложение работало суперпользователем (DB_USERNAME = суперпользователь). Он становится
#      DB_SUPERUSER (пароль — прежний DB_PASSWORD), приложение — selen_app с новым паролем, владелец — selen_owner.
#      Файл переписывается без смены inode: он смонтирован в контейнеры (`sed -i` сломал бы монтирование).
#   2. Роли: создать или обновить (пароли — из .env).
#   3. Базы DB_DATABASE и selen_testing (если есть): владелец базы и всех объектов — selen_owner, права selen_app.

source "$(dirname "$0")/lib.sh"

ENV_FILE="$ROOT_DIR/.env"
[[ -f "$ENV_FILE" ]] || die "Нет $ENV_FILE — нечего переводить на роли"

env_get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

env_set() {
  local key="$1" value="$2" content
  if grep -qE "^${key}=" "$ENV_FILE"; then
    content="$(awk -v k="$key" -v v="$value" -F= '$1 == k { print k "=" v; next } { print }' "$ENV_FILE")"
    printf '%s\n' "$content" > "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

random_hex() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

# --- 1. .env ------------------------------------------------------------------------------------------------

# Копия .env до перевода — для отката (scripts/pm.sh, update_failed); делается один раз
if [[ "$(env_get DB_USERNAME)" == "$(env_get DB_SUPERUSER)" || -z "$(env_get DB_SUPERUSER)" ]] \
  && [[ ! -f "$ENV_FILE.before-db-roles" ]]; then
  cp -p "$ENV_FILE" "$ENV_FILE.before-db-roles"
  log "Копия .env до перевода на роли: $ENV_FILE.before-db-roles"
fi

changed=()
if [[ -z "$(env_get DB_SUPERUSER)" ]]; then
  env_set DB_SUPERUSER "$(env_get DB_USERNAME)"
  changed+=(DB_SUPERUSER)
fi
if [[ -z "$(env_get DB_SUPERUSER_PASSWORD)" ]]; then
  env_set DB_SUPERUSER_PASSWORD "$(env_get DB_PASSWORD)"
  changed+=(DB_SUPERUSER_PASSWORD)
fi
if [[ "$(env_get DB_USERNAME)" == "$(env_get DB_SUPERUSER)" ]]; then
  env_set DB_USERNAME selen_app
  env_set DB_PASSWORD "$(random_hex 16)"
  changed+=(DB_USERNAME DB_PASSWORD)
fi
if [[ -z "$(env_get DB_OWNER_USERNAME)" ]]; then
  env_set DB_OWNER_USERNAME selen_owner
  changed+=(DB_OWNER_USERNAME)
fi
if [[ -z "$(env_get DB_OWNER_PASSWORD)" ]]; then
  env_set DB_OWNER_PASSWORD "$(random_hex 16)"
  changed+=(DB_OWNER_PASSWORD)
fi
if [[ ${#changed[@]} -gt 0 ]]; then
  log "В ${ENV_FILE} записаны: ${changed[*]}"
else
  log "В ${ENV_FILE} роли уже настроены"
fi

# Значения из .env — поверх прочитанных lib.sh до изменений
for key in DB_USERNAME DB_PASSWORD DB_OWNER_USERNAME DB_OWNER_PASSWORD DB_SUPERUSER DB_SUPERUSER_PASSWORD; do
  export "$key=$(env_get "$key")"
done

# --- 2. Роли ------------------------------------------------------------------------------------------------

if [[ "$PG_MODE" == "docker" ]]; then
  # postgres пересоздаётся с новыми переменными SELEN_DB_* и монтированием SQL; том и данные — те же
  compose up -d --wait postgres > /dev/null
fi

super() { pg_super psql -U "$DB_SUPERUSER" -v ON_ERROR_STOP=1 -q "$@"; }

log "Роли ${DB_OWNER_USERNAME} (владелец схемы) и ${DB_USERNAME} (приложение)"
super -d postgres -v owner="$DB_OWNER_USERNAME" -v owner_password="$DB_OWNER_PASSWORD" \
  -v app="$DB_USERNAME" -v app_password="$DB_PASSWORD" -f - < "$SQL_DIR/roles.sql"

# --- 3. Базы ------------------------------------------------------------------------------------------------

for db in "$DB_DATABASE" selen_testing; do
  [[ "$(super -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" == "1" ]] || continue
  log "База ${db}: владелец — ${DB_OWNER_USERNAME}, права ${DB_USERNAME}"
  super -d "$db" -v owner="$DB_OWNER_USERNAME" -f - < "$SQL_DIR/ownership.sql"
  super -d "$db" -v owner="$DB_OWNER_USERNAME" -v app="$DB_USERNAME" -f - < "$SQL_DIR/grants.sql"
done

log "Готово: приложение работает под ${DB_USERNAME}, миграции и бэкапы — под ${DB_OWNER_USERNAME}"
