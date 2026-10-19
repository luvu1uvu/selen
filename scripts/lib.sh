#!/usr/bin/env bash
# Общие функции для скриптов бэкапа. Подключается через `source`.
#
# Как выполняются команды PostgreSQL (pg_dump, pg_restore, psql):
#   PG_MODE=docker (по умолчанию) — внутри контейнера postgres из docker-compose.yml;
#   PG_MODE=local                 — напрямую на хосте (prod-сервер без Docker), нужен
#                                   установленный postgresql-client и доступ по DB_HOST/DB_PORT.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Переменные из файла KEY=value (без выполнения как shell-кода), не перетирая уже заданные в окружении
# (второй аргумент force — перетирая).
# Строка делится по первому «=» вручную: `IFS='=' read` в bash 3.2 (/bin/bash агентов) теряет «=» в конце значения
# (паддинг base64). Кавычки вокруг значения снимаются.
load_env_file() {
  local line key value
  [[ -f "$1" ]] || return 0
  while IFS= read -r line; do
    key="${line%%=*}"
    value="${line#*=}"
    [[ -n "${!key:-}" && "${2:-}" != "force" ]] && continue
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    export "$key=$value"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1")
}
load_env_file "$ROOT_DIR/.env"

PG_MODE="${PG_MODE:-docker}"
# Файл compose: dev — docker-compose.yml; стенд PM задаёт COMPOSE_FILE=docker-compose.pm.yml в своём .env
# (docs/runbook.md, «Стенд PM») — тогда бэкап и восстановление работают с базой и файлами стенда.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_DATABASE="${DB_DATABASE:-selen}"
# Роли базы (docs/adr/0016-db-roles.md): приложение — DB_USERNAME, бэкап и восстановление — владелец схемы,
# перевод на роли — суперпользователь. В .env до ролей владельца нет — тогда всё под DB_USERNAME, как раньше.
DB_USERNAME="${DB_USERNAME:-selen_app}"
DB_OWNER_USERNAME="${DB_OWNER_USERNAME:-$DB_USERNAME}"
DB_OWNER_PASSWORD="${DB_OWNER_PASSWORD:-${DB_PASSWORD:-}}"
DB_SUPERUSER="${DB_SUPERUSER:-selen}"
SQL_DIR="$ROOT_DIR/docker/postgres/sql"
BACKUP_DIR="${BACKUP_DIR:-backups}"
[[ "$BACKUP_DIR" = /* ]] || BACKUP_DIR="$ROOT_DIR/$BACKUP_DIR"
# Без «..» в выводе (у стенда BACKUP_DIR=../selen-pm-backups): путь копируют в make pm-restore FILE=…
# Каталог бэкапов — только владельцу: в дампах рабочие данные (файлы внутри — по umask скрипта бэкапа)
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR" && BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
# Уровни бэкапов: hourly — только при BACKUP_KEEP_HOURLY > 0 (стенд PM), daily, weekly (scripts/backup.sh)
BACKUP_TIERS=(hourly daily weekly)

# Вложения карточек (ADR-0010): каталог локального диска на хосте. При ATTACHMENTS_DISK=s3 файлы живут
# в S3-хранилище и его резервирует само хранилище — скрипты их пропускают.
ATTACHMENTS_DISK="${ATTACHMENTS_DISK:-attachments}"
ATTACHMENTS_PATH="${ATTACHMENTS_PATH:-backend/storage/app/private/attachments}"
[[ "$ATTACHMENTS_PATH" = /* ]] || ATTACHMENTS_PATH="$ROOT_DIR/$ATTACHMENTS_PATH"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ОШИБКА: $*" >&2; exit 1; }

# Выполнить утилиту PostgreSQL с паролем роли $1 (пароль — переменная окружения с именем $2).
# stdin/stdout пробрасываются (для дампов).
pg_with() {
  local password="${!1:-}"
  shift
  if [[ "$PG_MODE" == "docker" ]]; then
    # -e PGPASSWORD без значения — docker берёт его из окружения: пароль не виден в аргументах процесса (ps)
    PGPASSWORD="$password" compose exec -T -e PGPASSWORD postgres "$@"
  else
    PGPASSWORD="$password" PGHOST="${DB_HOST:-127.0.0.1}" PGPORT="${DB_PORT:-5432}" "$@"
  fi
}

# Под владельцем схемы (бэкап, восстановление): pg psql -U "$DB_OWNER_USERNAME" …
pg() { pg_with DB_OWNER_PASSWORD "$@"; }
# Под ролью приложения — проверки прав (backup-verify)
pg_app() { pg_with DB_PASSWORD "$@"; }
# Под суперпользователем — только перевод на роли (db-roles.sh)
pg_super() { pg_with DB_SUPERUSER_PASSWORD "$@"; }

# Есть ли отдельная роль приложения (после перевода на роли — да)
roles_enabled() { [[ "$DB_OWNER_USERNAME" != "$DB_USERNAME" ]]; }

# Права роли приложения в базе $1 (docker/postgres/sql/grants.sql) — после создания и восстановления базы
apply_grants() {
  roles_enabled || return 0
  pg psql -U "$DB_OWNER_USERNAME" -d "$1" -v ON_ERROR_STOP=1 -q \
    -v owner="$DB_OWNER_USERNAME" -v app="$DB_USERNAME" -f - < "$SQL_DIR/grants.sql"
}

compose() {
  docker compose -f "$ROOT_DIR/$COMPOSE_FILE" --project-directory "$ROOT_DIR" "$@"
}

# Нужно ли сохранять файлы вложений (локальный диск)
files_enabled() { [[ "$ATTACHMENTS_DISK" != "s3" ]]; }

# Каталог снапшота файлов, парный дампу: selen_2026-10-12_030000.dump → selen_2026-10-12_030000.files
files_dir_for() { echo "${1%.dump}.files"; }

# Манифест файлов вложений: «sha256  путь» по всем файлам, отсортированный (для сверки до/после)
files_manifest() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  ( cd "$dir" && find . -type f ! -name .gitignore | LC_ALL=C sort \
      | while IFS= read -r file; do shasum -a 256 "$file"; done )
}

# Самый свежий дамп по всем уровням бэкапов (пусто — бэкапов нет)
newest_dump() {
  local tier dumps=()
  for tier in "${BACKUP_TIERS[@]}"; do
    [[ -d "$BACKUP_DIR/$tier" ]] && dumps+=("$BACKUP_DIR/$tier"/*.dump)
  done
  [[ ${#dumps[@]} -gt 0 ]] || return 0
  ls -1t "${dumps[@]}" 2>/dev/null | head -n 1 || true
}

# Объём в КБ → «850K», «12.4M», «1.2G»
human_kb() { awk -v kb="$1" 'BEGIN {
  if (kb >= 1048576) printf "%.1fG", kb / 1048576; else if (kb >= 1024) printf "%.1fM", kb / 1024; else printf "%dK", kb }'; }

# Занятое место в КБ (жёсткие ссылки считаются один раз)
disk_kb() { du -sk "$@" 2>/dev/null | awk '{ s += $1 } END { print s + 0 }'; }

# Блокировка каталога бэкапов: бэкап по расписанию, make pm-backup / pm-update и копия в облако не идут
# одновременно (иначе копия захватила бы недописанный дамп или файлы посреди ротации). Ждёт до BACKUP_LOCK_WAIT
# секунд (по умолчанию 15 минут). Брошенную блокировку снимает: процесс с этим PID не работает или это уже другой
# процесс (после перезагрузки PID достаётся кому-то ещё — сверяем время старта), или ей больше 3 часов.
# Снимается при выходе. BACKUP_LOCK можно задать до вызова (у задания агента — своя блокировка).
BACKUP_LOCK="${BACKUP_LOCK:-$BACKUP_DIR/.lock}"
process_started() { ps -p "$1" -o lstart= 2>/dev/null | xargs || true; }
backup_lock() {
  local waited=0 wait="${BACKUP_LOCK_WAIT:-900}" owner pid started
  until mkdir "$BACKUP_LOCK" 2>/dev/null; do
    owner="$(cat "$BACKUP_LOCK/owner" 2>/dev/null || true)"
    pid="${owner%% *}"
    started="${owner#* }"
    if [[ -n "$owner" && "$(process_started "$pid")" != "$started" ]] \
      || [[ -n "$(find "$BACKUP_LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]]; then
      # Перед снятием — ещё раз: блокировку мог только что взять другой ожидающий
      if [[ "$(cat "$BACKUP_LOCK/owner" 2>/dev/null || true)" == "$owner" ]]; then
        log "Снимаю брошенную блокировку бэкапов (процесс ${pid:-?} уже завершился)"
        rm -rf "$BACKUP_LOCK"
      fi
      continue
    fi
    [[ "$waited" -lt "$wait" ]] || die "Другой бэкап (процесс ${pid:-?}) идёт дольше ${wait} с — пропускаю"
    [[ $((waited % 60)) -ne 0 ]] || log "Жду, пока закончится другой бэкап (процесс ${pid:-?})"
    sleep 5
    waited=$((waited + 5))
  done
  echo "$$ $(process_started $$)" > "$BACKUP_LOCK/owner"
  trap 'rm -rf "$BACKUP_LOCK"' EXIT
}

# Копия бэкапов вне машины (ADR-0018): restic → S3-совместимое хранилище. Настройки и ключи — в OFFSITE_ENV_FILE
# (шаблон — .env.offsite.example), не в .env приложения: .env целиком попадает в контейнеры, а ключ хранилища
# приложению не нужен. Значения из файла — поверх окружения (чужие AWS_* в shell не подменят ключ).
OFFSITE_ENV_FILE="${OFFSITE_ENV_FILE:-$HOME/.config/selen/offsite.env}"
load_offsite_env() { load_env_file "$OFFSITE_ENV_FILE" force; }
# Копия отключена осознанно: OFFSITE_ENABLED=false в файле (решение PM 2026-10-16 — до пилота). Тогда копия
# не делается и о ней не предупреждают; без переменной копия считается включённой
offsite_disabled() {
  [[ -f "$OFFSITE_ENV_FILE" ]] || return 1
  load_offsite_env
  [[ "$(printf '%s' "${OFFSITE_ENABLED:-true}" | tr '[:upper:]' '[:lower:]')" == "false" ]]
}
# Настроена ли копия: не отключена, в файле заданы хранилище, ключ и файл пароля restic
offsite_configured() {
  [[ -f "$OFFSITE_ENV_FILE" ]] || return 1
  ! offsite_disabled || return 1
  [[ -n "${RESTIC_REPOSITORY:-}" && -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" \
    && -n "${RESTIC_PASSWORD_FILE:-}" ]]
}
# Перед вызовом restic: копия включена и настроена, есть restic и файл пароля (ключи и пароль не печатаются)
offsite_ready() {
  ! offsite_disabled || die "Копия вне машины отключена (OFFSITE_ENABLED=false в $OFFSITE_ENV_FILE)"
  offsite_configured || die "Копия вне машины не настроена: заполните $OFFSITE_ENV_FILE (шаблон — .env.offsite.example)"
  [[ -r "$RESTIC_PASSWORD_FILE" ]] || die "Нет файла пароля restic: $RESTIC_PASSWORD_FILE"
  command -v restic > /dev/null || die "Не установлен restic: brew install restic"
}
