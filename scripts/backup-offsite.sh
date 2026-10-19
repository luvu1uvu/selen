#!/usr/bin/env bash
# Копия бэкапа вне машины (ADR-0018): restic → S3-совместимое хранилище в РФ (Yandex Object Storage, Selectel).
# Шифрует restic на этой машине паролем из RESTIC_PASSWORD_FILE — хранилище видит только зашифрованные данные.
#
#   ./scripts/backup-offsite.sh [путь/к/бэкапу.dump]   — без аргумента — самый свежий бэкап
#
# Один снапшот restic — один бэкап: дамп и парный снапшот файлов <имя>.files (одинаковые файлы restic хранит
# один раз). Хранение в облаке — как локально: ежечасные за BACKUP_KEEP_HOURLY часов, по одному в сутки
# за BACKUP_KEEP_DAILY дней, по одному в неделю за BACKUP_KEEP_WEEKLY недель. Снапшоты группируются только по тегу
# (хранилище — одно на стенд): после переименования машины старые снапшоты прореживаются как прежде.
# Освобождение места (prune) и проверка хранилища (check) — раз в сутки: prune блокирует хранилище целиком.
# Настройки и ключи — OFFSITE_ENV_FILE (по умолчанию ~/.config/selen/offsite.env, шаблон — .env.offsite.example).
# Хранилища ещё нет — создаётся (restic init). Ключи и пароль не печатаются. OFFSITE_ENABLED=false — копия отключена.

source "$(dirname "$0")/lib.sh"

offsite_ready

backup_lock
DUMP="${1:-$(newest_dump)}"
[[ -n "$DUMP" && -f "$DUMP" ]] || die "Нет бэкапа для копии: ${DUMP:-каталог $BACKUP_DIR пуст}"
PATHS=("$DUMP")
[[ ! -d "$(files_dir_for "$DUMP")" ]] || PATHS+=("$(files_dir_for "$DUMP")")
STARTED=$SECONDS

# Код 10 — хранилища нет (первый запуск), остальные ошибки (сеть, ключ, пароль) — стоп
status=0
restic cat config > /dev/null 2>&1 || status=$?
if [[ "$status" == "10" ]]; then
  log "Хранилища restic ещё нет — создаю: $RESTIC_REPOSITORY"
  restic init > /dev/null
elif [[ "$status" != "0" ]]; then
  restic cat config > /dev/null || true   # текст ошибки restic — в вывод
  die "Хранилище restic недоступно (код $status): сеть, ключ доступа или пароль"
fi

log "Копирую в облако: ${DUMP#"$BACKUP_DIR"/}"
output="$(restic backup --tag selen --no-scan "${PATHS[@]}" 2>&1)" \
  || { printf '%s\n' "$output"; die "restic backup завершился с ошибкой"; }
printf '%s\n' "$output" | grep -E '^(Files|Dirs|Added|snapshot)' || true

log "Ротация в облаке"
restic forget --tag selen --group-by tags --quiet \
  --keep-within-hourly "${BACKUP_KEEP_HOURLY:-48}h" \
  --keep-within-daily "${BACKUP_KEEP_DAILY:-30}d" \
  --keep-within-weekly "$(( ${BACKUP_KEEP_WEEKLY:-12} * 7 ))d"

PRUNED="$BACKUP_DIR/.offsite-pruned"
if [[ ! -f "$PRUNED" || -n "$(find "$PRUNED" -mmin +1440 2>/dev/null)" ]]; then
  log "Раз в сутки: освобождаю место и проверяю хранилище"
  restic prune --quiet
  restic check --quiet
  touch "$PRUNED"
fi

log "Копия в облаке готова за $((SECONDS - STARTED)) с"
