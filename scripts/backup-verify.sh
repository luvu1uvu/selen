#!/usr/bin/env bash
# Проверка, что бэкап реально восстанавливается — и база, и файлы вложений:
#   1) считаем строки в ключевых таблицах и снимаем манифест файлов (sha256);
#   2) делаем бэкап;
#   3) уничтожаем данные (DROP SCHEMA public CASCADE) и файлы вложений;
#   4) восстанавливаем из бэкапа;
#   5) сравниваем количество строк и манифест файлов, проверяем, что у каждого вложения есть файл.
#
#   make backup-verify
#
# Запускать на dev/stage. На production — только на копии базы.

source "$(dirname "$0")/lib.sh"

TABLES=(users invitations event_log sessions migrations spaces cards card_transitions comments attachments card_relations card_blocks)

count_rows() {
  local sql=""
  for table in "${TABLES[@]}"; do
    sql+="SELECT '$table' AS t, count(*) FROM $table UNION ALL "
  done
  sql="${sql% UNION ALL } ORDER BY 1;"
  pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -At -F '=' -c "$sql"
}

log "Шаг 1. Количество строк до бэкапа:"
BEFORE="$(count_rows)"
echo "$BEFORE" | sed 's/^/    /'
if files_enabled; then
  FILES_BEFORE="$(files_manifest "$ATTACHMENTS_PATH")"
  log "    Файлов вложений: $(printf '%s' "$FILES_BEFORE" | grep -c . || true)"
fi

log "Шаг 2. Создаю бэкап"
DUMP="$("$ROOT_DIR/scripts/backup.sh" | tail -n 1)"

log "Шаг 3. Удаляю все данные (DROP SCHEMA public CASCADE)"
pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -q -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
REMAINING="$(pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -At \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
log "    Таблиц в базе после удаления: $REMAINING"
[[ "$REMAINING" == "0" ]] || die "Данные не удалены"
if files_enabled; then
  find "$ATTACHMENTS_PATH" -mindepth 1 ! -name .gitignore -delete
  log "    Файлов вложений после удаления: $(find "$ATTACHMENTS_PATH" -type f ! -name .gitignore | wc -l | tr -d ' ')"
fi

log "Шаг 4. Восстанавливаю из $DUMP"
RESTORE_CONFIRM=yes "$ROOT_DIR/scripts/restore.sh" "$DUMP"

log "Шаг 5. Количество строк после восстановления:"
AFTER="$(count_rows)"
echo "$AFTER" | sed 's/^/    /'

if [[ "$BEFORE" == "$AFTER" ]]; then
  log "УСПЕХ: данные восстановлены полностью"
else
  die "Количество строк не совпадает"
fi

if files_enabled; then
  FILES_AFTER="$(files_manifest "$ATTACHMENTS_PATH")"
  [[ "$FILES_BEFORE" == "$FILES_AFTER" ]] || die "Файлы вложений не совпадают с исходными (sha256)"
  log "УСПЕХ: файлы вложений восстановлены, $(printf '%s' "$FILES_AFTER" | grep -c . || true) шт., контрольные суммы совпадают"

  # Каждому вложению в базе (кроме стёртых по сроку) соответствует файл
  MISSING=0
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    [[ -f "$ATTACHMENTS_PATH/$path" ]] || { log "    нет файла: $path"; MISSING=$((MISSING + 1)); }
  done < <(pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -At -c "SELECT path FROM attachments WHERE path <> '';")
  [[ "$MISSING" == "0" ]] || die "У $MISSING вложений нет файла"
  log "УСПЕХ: у каждого вложения в базе есть файл"
fi

# Append-only защита журнала событий пережила восстановление
if pg psql -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" -q -c "DELETE FROM event_log WHERE false;" 2>/dev/null; then
  die "Триггер запрета изменений event_log не восстановлен"
fi
log "УСПЕХ: триггер append-only на event_log на месте"

# Права роли приложения пережили восстановление: данные читает и пишет, историю менять и удалять не может
if roles_enabled; then
  pg_app psql -U "$DB_USERNAME" -d "$DB_DATABASE" -q -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM cards;" > /dev/null \
    || die "Роль приложения ${DB_USERNAME} не может читать данные после восстановления"
  for sql in "DELETE FROM event_log WHERE false;" "UPDATE card_transitions SET reason = reason WHERE false;" "TRUNCATE card_blocks;"; do
    if pg_app psql -U "$DB_USERNAME" -d "$DB_DATABASE" -q -c "$sql" 2>/dev/null; then
      die "Роль приложения ${DB_USERNAME} может выполнить: $sql"
    fi
  done
  log "УСПЕХ: права роли приложения ${DB_USERNAME} восстановлены, историю она изменить не может"
fi
