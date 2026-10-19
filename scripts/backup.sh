#!/usr/bin/env bash
# Бэкап базы данных и файлов вложений Selen с ротацией.
#
#   ./scripts/backup.sh            — создать бэкап (или: make backup)
#
# База: pg_dump custom (-Fc), сжатый, восстанавливается через scripts/restore.sh.
# Файлы вложений (ADR-0010): снапшот каталога рядом с дампом — <имя>.files/. Снапшоты инкрементальные:
#   rsync --link-dest к предыдущему снапшоту, неизменённые файлы — жёсткие ссылки (место не занимают).
#   Каждый снапшот выглядит как полная копия и удаляется вместе со своим дампом.
#   Порядок — сначала база, потом файлы: удалённые вложения стираются с диска только через 30 дней,
#   поэтому всё, на что ссылается дамп, в снапшоте есть.
# Уровни и ротация (время в именах и границы суток и недель — UTC):
#   hourly/  — только если BACKUP_KEEP_HOURLY > 0 (стенд PM, бэкап каждый час — ADR-0018): каждый бэкап кладётся сюда,
#              хранятся бэкапы за последние BACKUP_KEEP_HOURLY часов;
#   daily/   — без hourly — каждый бэкап, с hourly — первый бэкап суток; хранится BACKUP_KEEP_DAILY (по умолчанию 7);
#   weekly/  — первый бэкап недели (с понедельника) или принудительно BACKUP_FORCE_WEEKLY=1;
#              хранится BACKUP_KEEP_WEEKLY (4).
#   Копии на уровнях — жёсткие ссылки на тот же дамп и снапшот: место не занимают.
# Последняя строка вывода — путь к дампу (его берут pm-update, backup-verify, копия в облако).
# Пример для cron на сервере — в docs/runbook.md.

source "$(dirname "$0")/lib.sh"

# Дампы — только владельцу (каталог бэкапов — тоже, lib.sh). Файлы снапшота сохраняют права исходных вложений:
# при восстановлении nginx должен их прочитать
umask 077

KEEP_HOURLY="${BACKUP_KEEP_HOURLY:-0}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
backup_lock
STARTED=$SECONDS
# Остатки оборванного бэкапа (пропало питание, kill): под блокировкой других бэкапов нет — удаляем
find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -name '*.partial' -exec rm -rf {} +

if [[ "$KEEP_HOURLY" -gt 0 ]]; then TIER=hourly; else TIER=daily; fi
mkdir -p "$BACKUP_DIR/$TIER" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
# Имя — по времени после блокировки; бэкап в ту же секунду (ждал предыдущего) — следующая секунда
while :; do
  FILE_NAME="${DB_DATABASE}_$(date -u '+%Y-%m-%d_%H%M%S').dump"
  TARGET="$BACKUP_DIR/$TIER/$FILE_NAME"
  [[ -e "$TARGET" ]] || break
  sleep 1
done

log "Создаю бэкап базы «${DB_DATABASE}» → $TARGET"
# Пишем во временный файл, чтобы оборванный дамп не попал в ротацию
if ! pg pg_dump -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -Fc --no-owner --no-privileges > "$TARGET.partial"; then
  rm -f "$TARGET.partial"
  die "pg_dump завершился с ошибкой"
fi
mv "$TARGET.partial" "$TARGET"

# Проверка целостности: архив читается и содержит оглавление
if ! pg pg_restore --list < "$TARGET" > /dev/null; then
  die "Файл бэкапа повреждён: $TARGET"
fi
log "Готово: $(du -h "$TARGET" | cut -f1)"

# Снапшот файлов вложений: жёсткие ссылки на предыдущий снапшот (если есть), новые файлы — копией
snapshot_files() {
  local target="$1" previous="$2"
  local link=()
  [[ -n "$previous" && -d "$previous" ]] && link=(--link-dest="$previous")
  mkdir -p "$ATTACHMENTS_PATH"
  if ! rsync -a --delete ${link[@]+"${link[@]}"} "$ATTACHMENTS_PATH/" "$target.partial/"; then
    rm -rf "$target.partial"
    die "Не удалось сохранить файлы вложений"
  fi
  mv "$target.partial" "$target"
}

# Предыдущий снапшот файлов — самый свежий по имени (время UTC в имени). Не по времени изменения: rsync -a копирует
# снапшоту время каталога вложений, у снапшотов оно одинаковое, и --link-dest связывал бы с давним снапшотом —
# новые файлы копировались бы в каждый ежечасный снапшот заново
newest_files_snapshot() {
  local dir newest=""
  for dir in "$BACKUP_DIR"/{hourly,daily}/*.files; do
    [[ -d "$dir" ]] || continue
    if [[ -z "$newest" || "$(basename "$dir")" > "$(basename "$newest")" ]]; then newest="$dir"; fi
  done
  echo "$newest"
}

FILES_TARGET="$(files_dir_for "$TARGET")"
FILES_COUNT=""
# Размер бэкапа — дамп и новые файлы снапшота (файлы, общие с предыдущим снапшотом, — жёсткие ссылки, du их
# считает один раз — за предыдущим снапшотом)
SIZE_KB="$(disk_kb "$TARGET")"
if files_enabled; then
  PREVIOUS_FILES="$(newest_files_snapshot)"
  log "Сохраняю файлы вложений → $FILES_TARGET"
  snapshot_files "$FILES_TARGET" "$PREVIOUS_FILES"
  FILES_COUNT="$(find "$FILES_TARGET" -type f ! -name .gitignore | wc -l | tr -d ' ')"
  log "Готово: $FILES_COUNT файлов"
  if [[ -n "$PREVIOUS_FILES" ]]; then
    SIZE_KB=$((SIZE_KB + $(disk_kb "$PREVIOUS_FILES" "$FILES_TARGET") - $(disk_kb "$PREVIOUS_FILES")))
  else
    SIZE_KB=$((SIZE_KB + $(disk_kb "$FILES_TARGET")))
  fi
else
  log "Вложения в S3 (ATTACHMENTS_DISK=s3) — их резервирует хранилище, пропускаю"
fi

# Копия бэкапа на другой уровень: дамп и снапшот — жёсткими ссылками
promote() {
  local tier="$1" dest="$BACKUP_DIR/$1/$FILE_NAME"
  ln "$TARGET" "$dest" 2>/dev/null || cp -p "$TARGET" "$dest"
  if [[ -d "$FILES_TARGET" ]]; then
    rsync -a --link-dest="$FILES_TARGET" "$FILES_TARGET/" "$(files_dir_for "$dest")/"
  fi
  log "Сделана копия в $tier/"
}

# Есть ли на уровне бэкап с датой (UTC) не раньше $2 (ГГГГ-ММ-ДД; имена файлов сравниваются как строки)
has_since() {
  local file
  for file in "$BACKUP_DIR/$1"/*.dump; do
    [[ "$file" =~ _([0-9]{4}-[0-9]{2}-[0-9]{2})_[0-9]{6}\.dump$ ]] || continue
    [[ "${BASH_REMATCH[1]}" < "$2" ]] || return 0
  done
  return 1
}

# Дата (UTC) по времени в секундах: BSD date (macOS) — -r, GNU date (Linux) — -d @
utc_date() { date -u -r "$1" '+%Y-%m-%d' 2>/dev/null || date -u -d "@$1" '+%Y-%m-%d'; }

TODAY="$(date -u '+%Y-%m-%d')"
MONDAY="$(utc_date $(( $(date -u '+%s') - ($(date -u '+%u') - 1) * 86400 )))"
if [[ "$TIER" == "hourly" ]] && ! has_since daily "$TODAY"; then
  promote daily
fi
if [[ "${BACKUP_FORCE_WEEKLY:-0}" == "1" ]] || ! has_since weekly "$MONDAY"; then
  promote weekly
fi

remove_backup() {
  rm -f "$1"
  rm -rf "$(files_dir_for "$1")"
  log "Удалён старый бэкап: ${1#"$BACKUP_DIR"/}"
}

# Ротация: N самых свежих в каталоге
rotate() {
  local dir="$1" keep="$2" old
  { ls -1t "$dir"/*.dump 2>/dev/null || true; } | tail -n +"$((keep + 1))" | while read -r old; do
    remove_backup "$old"
  done
}
# Ежечасные — по возрасту: старше KEEP_HOURLY часов
rotate_by_age() {
  local dir="$1" hours="$2" old
  find "$dir" -maxdepth 1 -name '*.dump' -mmin +$((hours * 60)) | while read -r old; do
    remove_backup "$old"
  done
}
[[ "$TIER" != "hourly" ]] || rotate_by_age "$BACKUP_DIR/hourly" "$KEEP_HOURLY"
rotate "$BACKUP_DIR/daily" "$KEEP_DAILY"
rotate "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

# Отчёт (строку «Бэкап готов» показывает make host-status): длительность, размер бэкапа, место под все бэкапы
log "Бэкап готов за $((SECONDS - STARTED)) с: размер $(human_kb "$SIZE_KB") (дамп $(human_kb "$(disk_kb "$TARGET")")\
${FILES_COUNT:+, файлов вложений ${FILES_COUNT}}), всего бэкапов на диске $(human_kb "$(disk_kb "$BACKUP_DIR")")"

echo "$TARGET"
