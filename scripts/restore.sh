#!/usr/bin/env bash
# Восстановление базы данных и файлов вложений Selen из бэкапа.
# Файлы берутся из парного снапшота <имя>.files рядом с дампом (если его нет — бэкап старше этапа 2,
# восстанавливается только база).
#
#   ./scripts/restore.sh backups/daily/selen_2026-10-12_030000.dump
#   make restore FILE=backups/daily/selen_2026-10-12_030000.dump
#
# ВНИМАНИЕ: текущие данные в базе будут ЗАМЕНЕНЫ данными из бэкапа.
# Чтобы пропустить подтверждение (для скриптов): RESTORE_CONFIRM=yes.

source "$(dirname "$0")/lib.sh"

FILE="${1:-}"
[[ -n "$FILE" ]] || die "Укажите файл бэкапа: ./scripts/restore.sh <файл.dump>"
[[ -f "$FILE" ]] || die "Файл не найден: $FILE"

pg pg_restore --list < "$FILE" > /dev/null || die "Файл не похож на бэкап pg_dump: $FILE"
FILES_SOURCE="$(files_dir_for "$FILE")"

if [[ "${RESTORE_CONFIRM:-}" != "yes" ]]; then
  echo "База «${DB_DATABASE}» будет перезаписана данными из $FILE."
  if files_enabled && [[ -d "$FILES_SOURCE" ]]; then
    echo "Файлы вложений в $ATTACHMENTS_PATH будут заменены снапшотом $FILES_SOURCE."
  fi
  read -r -p "Продолжить? Введите yes: " answer
  [[ "$answer" == "yes" ]] || die "Отменено пользователем"
fi

# Останавливаем фоновые процессы, чтобы они не писали в базу во время восстановления
if [[ "$PG_MODE" == "docker" ]]; then
  log "Останавливаю queue и scheduler"
  compose stop queue scheduler > /dev/null
fi

log "Пересоздаю базу «${DB_DATABASE}»"
# Закрываем активные подключения и пересоздаём базу: восстановление в пустую базу
# надёжнее, чем --clean поверх существующих объектов.
# Под владельцем схемы (docs/adr/0016-db-roles.md): у него CREATEDB и право закрыть подключения приложения
pg psql -U "$DB_OWNER_USERNAME" -d postgres -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '$DB_DATABASE' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DB_DATABASE";
CREATE DATABASE "$DB_DATABASE" OWNER "$DB_OWNER_USERNAME";
SQL

log "Восстанавливаю данные из $FILE"
pg pg_restore -U "$DB_OWNER_USERNAME" -d "$DB_DATABASE" --no-owner --no-privileges --exit-on-error < "$FILE"

# Бэкап снят без прав (--no-privileges): роли приложения выдаём их заново, история — только чтение и добавление
if roles_enabled; then
  log "Права роли приложения ${DB_USERNAME}"
  apply_grants "$DB_DATABASE"
fi

if files_enabled; then
  if [[ -d "$FILES_SOURCE" ]]; then
    log "Восстанавливаю файлы вложений из $FILES_SOURCE"
    mkdir -p "$ATTACHMENTS_PATH"
    # --delete: в каталоге остаётся ровно то, что было на момент бэкапа (.gitignore каталога не трогаем)
    rsync -a --delete --exclude=.gitignore "$FILES_SOURCE/" "$ATTACHMENTS_PATH/"
  else
    log "Снапшота файлов рядом с дампом нет (бэкап до этапа 2) — восстановлена только база"
  fi
fi

if [[ "$PG_MODE" == "docker" ]]; then
  log "Запускаю queue и scheduler"
  compose start queue scheduler > /dev/null
fi

log "Восстановление завершено"
