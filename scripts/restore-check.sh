#!/usr/bin/env bash
# Проверка, что последний бэкап восстанавливается, — без вмешательства в живую базу (ADR-0018):
#   1) бэкап: самый свежий локальный (local) или последний снапшот из облака restic (offsite; по умолчанию — если
#      копия вне машины включена и настроена, иначе local — в том числе при OFFSITE_ENABLED=false);
#   2) отдельный временный compose-проект selen-restore-check: только postgres, без портов, данные — в анонимном
#      томе; живые контейнеры и тома не затрагиваются;
#   3) pg_restore во временную базу; сверка с живой базой: число карточек (вместе с корзиной), вложений и файлов
#      вложений, у каждого вложения в бэкапе есть файл;
#   4) временный проект и восстановленные файлы удаляются (и при ошибке).
#
#   ./scripts/restore-check.sh [local|offsite]     (стенд PM: make pm-restore-check — сначала свежий бэкап)
#
# Бэкап и живая база сравниваются как есть: если после бэкапа появились карточки, проверка это покажет —
# поэтому make pm-restore-check перед проверкой делает свежий бэкап.

source "$(dirname "$0")/lib.sh"

FROM="${1:-}"
if [[ -z "$FROM" ]]; then
  if offsite_configured; then FROM=offsite; else FROM=local; fi
fi
[[ "$FROM" == "local" || "$FROM" == "offsite" ]] || die "Источник бэкапа — local или offsite, а не «${FROM}»"

PROJECT=selen-restore-check
WORK="$(mktemp -d "${TMPDIR:-/tmp}/selen-restore-check.XXXXXX")"
chmod 700 "$WORK"
# Временный проект: postgres из того же compose-файла (тот же образ), но без портов, томов и init-скриптов
cat > "$WORK/override.yml" <<'YAML'
services:
  postgres:
    ports: !reset []
    volumes: !reset []
    restart: "no"
YAML
check_compose() {
  docker compose -p "$PROJECT" -f "$ROOT_DIR/$COMPOSE_FILE" -f "$WORK/override.yml" --project-directory "$ROOT_DIR" "$@"
}
cleanup() {
  check_compose down -v --remove-orphans > /dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- 1. Бэкап ---------------------------------------------------------------------------------------------

if [[ "$FROM" == "offsite" ]]; then
  offsite_ready
  log "Скачиваю последний снапшот из облака ($RESTIC_REPOSITORY)"
  restic restore latest --tag selen --target "$WORK/restored" --quiet
  DUMP="$(find "$WORK/restored" -name '*.dump' -type f | head -n 1)"
  [[ -n "$DUMP" ]] || die "В последнем снапшоте restic нет дампа"
  log "Снапшот из облака: $(basename "$DUMP")"
else
  DUMP="$(newest_dump)"
  [[ -n "$DUMP" ]] || die "В $BACKUP_DIR нет бэкапов"
  log "Локальный бэкап: ${DUMP#"$BACKUP_DIR"/}"
fi
FILES_DIR="$(files_dir_for "$DUMP")"

# --- 2. Временный проект ----------------------------------------------------------------------------------

log "Временный проект ${PROJECT}: postgres"
check_compose up -d --wait postgres > /dev/null 2>&1 || { check_compose up -d --wait postgres; die "postgres временного проекта не запустился"; }
check_sql() { check_compose exec -T postgres psql -U "$DB_SUPERUSER" -v ON_ERROR_STOP=1 -q -At "$@"; }

# --- 3. Восстановление и сверка ---------------------------------------------------------------------------

log "Восстанавливаю во временную базу"
check_sql -d postgres -c "CREATE DATABASE selen_check"
check_compose exec -T postgres pg_restore -U "$DB_SUPERUSER" -d selen_check --no-owner --no-privileges \
  --exit-on-error < "$DUMP"

backup_count() { check_sql -d selen_check -c "$1"; }
live_count() { pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 -At -c "$1"; }
count_files() { if [[ -d "$1" ]]; then find "$1" -type f ! -name .gitignore | wc -l | tr -d ' '; else echo 0; fi; }

FAILED=0
compare() {
  local what="$1" backup="$2" live="$3"
  # Пустой или нечисловой ответ — запрос не выполнился (подробности — выше), это не «совпадает»
  [[ "$backup" =~ ^[0-9]+$ && "$live" =~ ^[0-9]+$ ]] || die "${what}: не удалось посчитать (бэкап: «${backup}», живой стенд: «${live}»)"
  if [[ "$backup" == "$live" ]]; then
    log "  ${what}: в бэкапе ${backup}, на живом стенде ${live} — совпадает"
  else
    log "  ${what}: в бэкапе ${backup}, на живом стенде ${live} — НЕ СОВПАДАЕТ"
    FAILED=1
  fi
}
log "Сверка с живой базой «${DB_DATABASE}»"
compare "Карточек (с корзиной)" "$(backup_count 'SELECT count(*) FROM cards')" "$(live_count 'SELECT count(*) FROM cards')"
compare "Вложений" "$(backup_count 'SELECT count(*) FROM attachments')" "$(live_count 'SELECT count(*) FROM attachments')"
if files_enabled; then
  compare "Файлов вложений" "$(count_files "$FILES_DIR")" "$(count_files "$ATTACHMENTS_PATH")"
  MISSING=0
  PATHS="$(backup_count "SELECT path FROM attachments WHERE path <> ''")" || die "Не удалось прочитать пути вложений из бэкапа"
  while IFS= read -r path; do
    [[ -z "$path" || -f "$FILES_DIR/$path" ]] || { log "  нет файла в бэкапе: $path"; MISSING=$((MISSING + 1)); }
  done <<< "$PATHS"
  if [[ "$MISSING" == "0" ]]; then log "  У каждого вложения в бэкапе есть файл"; else FAILED=1; fi
fi

[[ "$FAILED" == "0" ]] || die "Бэкап не совпадает с живым стендом (если данные менялись после бэкапа — повторите)"
log "УСПЕХ: бэкап ($FROM) восстанавливается и совпадает с живым стендом; временный проект удаляется"
