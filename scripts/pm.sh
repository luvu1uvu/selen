#!/usr/bin/env bash
# Стенд PM — постоянная копия Selen (docs/runbook.md, «Стенд PM»; docs/adr/0014-pm-stand.md).
#
#   make pm-up | pm-down | pm-owner | pm-update | pm-backup | pm-restore FILE=… | pm-restore-check [FROM=…] |
#        pm-backlog OWNER=… | pm-qa-bot | pm-bug FILE=… | pm-bug-move KEY=… TO=… |
#        pm-bug-show KEY=… | pm-bugs-list | pm-bug-comment KEY=… TEXT=… (или FILE=…) | pm-task FILE=… |
#        pm-owner-show | pm-transfer-ownership EMAIL=…
#
# Makefile основной копии вызывает этот скрипт ИЗ РАБОЧЕЙ КОПИИ СТЕНДА (git worktree на коде main),
# поэтому процедуры стенда всегда из main, а не из ветки этапа. Все docker compose — с файлом
# docker-compose.pm.yml (проект selen-pm): dev- и E2E-стек не затрагиваются.
set -Eeuo pipefail

STAND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$STAND_DIR/.env"
INBOX="$STAND_DIR/backend/storage/app/pm-inbox"
# Вложения карточки для pm-bug-show: контейнер пишет сюда, скрипт переносит в .pm-bugs основной копии
OUTBOX="$STAND_DIR/backend/storage/app/pm-outbox"
# Коммит, для которого собраны vendor и frontend/dist (после отката кода — пересборка)
BUILT_MARKER="$STAND_DIR/backend/storage/app/pm-built-commit"
export HOST_UID="${HOST_UID:-$(id -u)}" HOST_GID="${HOST_GID:-$(id -g)}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

compose() { docker compose --project-directory "$STAND_DIR" -f "$STAND_DIR/docker-compose.pm.yml" "$@"; }
artisan() { compose exec -T php php artisan "$@"; }

# --- .env стенда -------------------------------------------------------------------------------------------

# Значение из .env стенда; нет ключа — пустая строка
env_get() { { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# Запись значения без смены inode: файл смонтирован в контейнеры, `sed -i` сломал бы монтирование
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

ensure_env() {
  [[ -f "$ENV_FILE" ]] && return
  log "Создаю $ENV_FILE из .env.pm.example (APP_KEY и пароли базы — новые)"
  cp "$STAND_DIR/.env.pm.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  env_set APP_KEY "base64:$(head -c 32 /dev/urandom | base64)"
  # Роли базы (docs/adr/0016-db-roles.md): приложение, владелец схемы, суперпользователь
  env_set DB_PASSWORD "$(random_hex 16)"
  env_set DB_OWNER_PASSWORD "$(random_hex 16)"
  env_set DB_SUPERUSER_PASSWORD "$(random_hex 16)"
}

# Роли базы: старый стенд (приложение под суперпользователем) переводится на selen_owner / selen_app,
# на новом — проверка, что всё на месте. Повторный запуск безопасен (scripts/db-roles.sh)
db_roles() {
  log "Роли базы"
  "$STAND_DIR/scripts/db-roles.sh"
}

# Переменные, появившиеся в .env.pm.example с новым кодом, — дописать в .env стенда со значениями из шаблона
env_add_missing() {
  local line key added=()
  while IFS= read -r line; do
    key="${line%%=*}"
    grep -qE "^${key}=" "$ENV_FILE" || { printf '%s\n' "$line" >> "$ENV_FILE"; added+=("$key"); }
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$STAND_DIR/.env.pm.example")
  [[ ${#added[@]} -eq 0 ]] || log "В .env стенда добавлены новые переменные из .env.pm.example: ${added[*]}"
}

require_env() { [[ -f "$ENV_FILE" ]] || die "Стенд ещё не создан — выполните make pm-up."; }

# --- Сборка и запуск ---------------------------------------------------------------------------------------

build() {
  rm -f "$BUILT_MARKER"   # прерванная сборка — пересобрать при следующем pm-up
  log "Зависимости backend (composer, без dev-пакетов)"
  compose run --rm --no-deps -T php composer install --no-dev --optimize-autoloader --no-interaction --no-progress
  # npm ci стирает node_modules и качает всё заново — только если изменился package-lock.json
  local lock_hash lock_marker="$STAND_DIR/frontend/node_modules/.pm-lock-sha256"
  lock_hash="$(shasum -a 256 "$STAND_DIR/frontend/package-lock.json" | cut -d' ' -f1)"
  if [[ "$(cat "$lock_marker" 2>/dev/null || true)" != "$lock_hash" ]]; then
    log "Зависимости frontend (npm ci)"
    compose run --rm --no-deps -T builder npm ci --no-audit --no-fund
    echo "$lock_hash" > "$lock_marker"
  fi
  log "Production-сборка фронтенда"
  compose run --rm --no-deps -T builder npm run build
  log "Образ php"
  compose build -q php
  git -C "$STAND_DIR" rev-parse HEAD > "$BUILT_MARKER"
}

built_for_head() { [[ -f "$BUILT_MARKER" && "$(cat "$BUILT_MARKER")" == "$(git -C "$STAND_DIR" rev-parse HEAD)" ]]; }

# Миграции и кеши как на сервере (кеш конфигурации — заново: он мог остаться от прошлого кода).
# Миграции — под владельцем схемы: у роли приложения нет прав на DDL (docs/adr/0016-db-roles.md)
migrate() {
  artisan optimize:clear --quiet
  log "Миграции (migrate --force под владельцем схемы, без пересоздания базы)"
  artisan migrate --force --database=pgsql_owner
  artisan optimize --quiet
}

start() {
  compose up -d --wait --remove-orphans nginx php queue scheduler postgres redis mailpit
  artisan up --quiet 2>/dev/null || true
  log "Стенд работает: $(env_get APP_URL)  (письма: http://127.0.0.1:$(env_get PM_MAIL_PORT))"
}

cmd_up() {
  ensure_env
  env_add_missing
  db_roles
  built_for_head || build
  compose up -d --wait postgres redis
  compose up -d --wait php
  migrate
  start
  if [[ "$(artisan tinker --execute 'echo App\Models\User::query()->count();' 2>/dev/null | tail -n 1)" == "0" ]]; then
    log "Пользователей ещё нет — создайте свою учётную запись: make pm-owner"
  fi
}

cmd_down() { compose down; log "Стенд остановлен, данные сохранены. Запуск — make pm-up."; }

cmd_owner() {
  require_env
  local admins
  admins="$(PGPASSWORD="$(env_get DB_PASSWORD)" compose exec -T -e PGPASSWORD postgres psql -U "$(env_get DB_USERNAME)" \
    -d "$(env_get DB_DATABASE)" -Atc "SELECT string_agg(email, ', ' ORDER BY email) FROM users WHERE status = 'active' AND (role = 'owner' OR id IN (SELECT user_id FROM company_members WHERE is_admin))")"
  [[ -z "$admins" ]] \
    || log "На стенде уже есть администраторы: $admins. Если это вы — вторая учётная запись не нужна, выйдите (Ctrl+C)."
  # Администраторы — у компаний (ADR-0024): Владелец и администраторы «Компании 1»
  log "Учётная запись PM (администратор «Компании 1»; первая на стенде — Владелец). Email и пароль никуда не сохраняются."
  compose exec php php artisan app:create-admin
}

# Кто Владелец (ADR-0017) и с какого момента
cmd_owner_show() { require_env; artisan app:owner; }

# Аварийная передача владения: команда спрашивает подтверждение, поэтому с терминалом (без -T)
cmd_transfer_ownership() {
  require_env
  [[ "${1:-}" == *@* ]] || die "Укажите email нового Владельца, без кавычек и скобок: make pm-transfer-ownership EMAIL=you@example.com"
  compose exec php php artisan app:transfer-ownership "$1"
}

# --- Обновление --------------------------------------------------------------------------------------------

cmd_update() {
  require_env
  local git=(git -C "$STAND_DIR") previous upstream backup
  [[ -z "$("${git[@]}" status --porcelain --untracked-files=no)" ]] \
    || die "В рабочей копии стенда есть правки — стенд работает только на коде main. Посмотрите: git -C $STAND_DIR status"
  upstream="$("${git[@]}" rev-parse --abbrev-ref '@{upstream}')"
  previous="$("${git[@]}" rev-parse --short HEAD)"

  log "Бэкап перед обновлением"
  backup="$("$STAND_DIR/scripts/backup.sh" | tail -n 1)"

  "${git[@]}" fetch -q origin
  if [[ "$("${git[@]}" rev-parse HEAD)" == "$("${git[@]}" rev-parse "$upstream")" ]]; then
    log "Код стенда уже свежий ($previous, $upstream). Бэкап: $backup"
    return
  fi
  artisan down --retry=15 --quiet
  "${git[@]}" merge --ff-only -q "$upstream" \
    || { artisan up --quiet; die "Обновление только fast-forward, а $upstream с кодом стенда разошёлся. Стенд не изменён."; }
  log "Код: $previous → $("${git[@]}" rev-parse --short HEAD) ($upstream)"

  # Сборку и миграции выполняет уже новая версия скрипта
  exec "$STAND_DIR/scripts/pm.sh" _apply-update "$backup" "$previous"
}

cmd__apply_update() {
  local backup="$1" previous="$2" stage
  trap 'update_failed "$stage" "$backup" "$previous"' ERR
  stage="роли базы"
  env_add_missing
  db_roles
  stage="сборка"
  build
  compose up -d --wait postgres redis
  compose up -d --wait --force-recreate php
  stage="миграции"
  migrate
  stage="перезапуск"
  compose up -d --wait --force-recreate queue scheduler nginx
  start
  trap - ERR
  log "Обновление завершено. Бэкап до обновления: $backup"
}

update_failed() {
  local stage="$1" backup="$2" previous="$3"
  cat >&2 <<MSG

ОШИБКА: обновление стенда не завершено — не прошёл этап «${stage}» (подробности — выше).
Стенд в режиме обслуживания. Данные до обновления — в бэкапе:
  $backup
Вернуть стенд в состояние до обновления (команды — из основной копии Selen):
  1. git -C $STAND_DIR reset --hard $previous     # код стенда — как до обновления
  2. cp $STAND_DIR/.env.before-db-roles $STAND_DIR/.env   # только если такой файл есть: .env до перевода на роли базы
  3. make pm-restore FILE=$backup     # база и файлы — из бэкапа (если успели пройти миграции)
  4. make pm-up                                   # пересборка и запуск
Текст ошибки пришлите разработчику.
MSG
}

# --- Бэкапы ------------------------------------------------------------------------------------------------

cmd_backup() { require_env; "$STAND_DIR/scripts/backup.sh"; }

cmd_restore() {
  require_env
  [[ -n "${1:-}" ]] || die "Укажите бэкап — путь из последней строки make pm-backup, например: make pm-restore FILE=$(env_get BACKUP_DIR)/hourly/selen_2026-10-14_120000.dump"
  "$STAND_DIR/scripts/restore.sh" "$1"
  artisan optimize:clear --quiet && artisan optimize --quiet
}

# Проверка восстановления (ADR-0018): свежий бэкап с копией в облако — тем же заданием, что по расписанию, — затем
# восстановление во временный проект и сверка с живым стендом (источник — облако, если копия настроена; FROM=local)
cmd_restore_check() {
  require_env
  "$STAND_DIR/scripts/host.sh" backup-job || die "Свежий бэкап или его копия в облако не удались — проверка не запускается"
  "$STAND_DIR/scripts/restore-check.sh" "${1:-}"
}

# --- Бэклог PM, QA-бот, баги -------------------------------------------------------------------------------

cmd_backlog() {
  require_env
  local owner="${1:-}"
  [[ "$owner" == *@* ]] || die "Укажите свой email (тот, что вводили в make pm-owner), без кавычек и скобок: make pm-backlog OWNER=you@example.com"
  artisan pm:backlog "$owner" /var/www/docs/pm/deferred.yaml
  env_set PM_OWNER_EMAIL "$owner"
}

owner_email() {
  local owner; owner="$(env_get PM_OWNER_EMAIL)"
  [[ -n "$owner" ]] || die "Сначала make pm-backlog OWNER=you@example.com (ваш email на стенде) — он заводит пространство LATER."
  echo "$owner"
}

cmd_qa_bot() {
  require_env
  local owner password
  owner="$(owner_email)"
  password="$(env_get QA_BOT_PASSWORD)"
  if [[ -z "$password" ]]; then
    password="$(random_hex 16)"
    env_set QA_BOT_PASSWORD "$password"
    log "Пароль QA-бота сгенерирован и записан в $ENV_FILE"
  fi
  QA_BOT_PASSWORD="$password" compose exec -T -e QA_BOT_PASSWORD php \
    php artisan pm:qa-bot "$owner" "$(env_get QA_BOT_EMAIL)"
}

# JSON и скриншот копируются в storage стенда (контейнер видит только его), после команды — удаляются
cmd_bug() {
  require_env
  local file="${1:-}" dir screenshot args=()
  [[ -f "$file" ]] || die "Нет файла бага: ${file:-укажите FILE=путь/к/bug.json}. Формат — docs/runbook.md, «Стенд PM»."
  dir="$INBOX/$(date +%s)-$$"
  mkdir -p "$dir"
  trap "rm -rf '$dir'" EXIT   # путь подставляется сейчас: на выходе локальной переменной уже нет
  cp "$file" "$dir/bug.json"

  # Путь к скриншоту из JSON — абсолютный или относительно файла бага
  screenshot="$(grep -oE '"screenshot"[[:space:]]*:[[:space:]]*"[^"]+"' "$file" | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/' || true)"
  if [[ -n "$screenshot" ]]; then
    [[ "$screenshot" = /* ]] || screenshot="$(cd "$(dirname "$file")" && pwd)/$screenshot"
    [[ -f "$screenshot" ]] || die "Нет файла скриншота: $screenshot"
    cp "$screenshot" "$dir/$(basename "$screenshot")"
    args+=(--screenshot="/var/www/backend/storage/app/pm-inbox/$(basename "$dir")/$(basename "$screenshot")")
  fi

  artisan pm:bug "/var/www/backend/storage/app/pm-inbox/$(basename "$dir")/bug.json" \
    --owner="$(owner_email)" --bot="$(env_get QA_BOT_EMAIL)" ${args[@]+"${args[@]}"}
}

# Карточка работы на «Бэклоге» («Взято в работу») — для работы без карточки на стенде; JSON копируется в storage
cmd_task() {
  require_env
  local file="${1:-}" dir
  [[ -f "$file" ]] || die "Нет файла: ${file:-укажите FILE=путь/к/task.json}. Формат — docs/runbook.md, «Стенд PM»."
  dir="$INBOX/$(date +%s)-$$"
  mkdir -p "$dir"
  trap "rm -rf '$dir'" EXIT
  cp "$file" "$dir/task.json"
  artisan pm:task "/var/www/backend/storage/app/pm-inbox/$(basename "$dir")/task.json" \
    --owner="$(owner_email)" --bot="$(env_get QA_BOT_EMAIL)"
}

cmd_bug_move() {
  require_env
  [[ -n "${1:-}" && -n "${2:-}" ]] || die "Укажите карточку и колонку: make pm-bug-move KEY=LATER-12 TO=Исправлено"
  artisan pm:bug-move "$1" "$2" --bot="$(env_get QA_BOT_EMAIL)"
}

# Карточка целиком; вложения — в каталог «$2/KEY» (Makefile передаёт .pm-bugs основной копии, он в .gitignore)
cmd_bug_show() {
  require_env
  local key dest="${2:-$PWD/.pm-bugs}" out file
  key="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
  [[ -n "$key" ]] || die "Укажите карточку: make pm-bug-show KEY=LATER-12"
  out="$OUTBOX/$(date +%s)-$$"
  mkdir -p "$out"
  trap "rm -rf '$out'" EXIT
  artisan pm:bug-show "$key" --bot="$(env_get QA_BOT_EMAIL)" \
    --files="/var/www/backend/storage/app/pm-outbox/$(basename "$out")"

  if compgen -G "$out/*" > /dev/null; then
    rm -rf "${dest:?}/$key" && mkdir -p "$dest/$key" && cp "$out"/* "$dest/$key/"
    printf '\nФайлы сохранены:\n'
    for file in "$dest/$key"/*; do printf '  %s\n' "$file"; done
  fi
}

cmd_bugs_list() {
  require_env
  artisan pm:bugs-list --bot="$(env_get QA_BOT_EMAIL)" ${1:+--column="$1"}
}

# Комментарий QA-бота: текст из TEXT или из файла FILE (файл копируется в storage стенда — контейнер видит только его)
cmd_bug_comment() {
  require_env
  local key="${1:-}" text="${2:-}" file="${3:-}" dir
  [[ -n "$key" ]] || die "Укажите карточку: make pm-bug-comment KEY=LATER-12 TEXT=\"Взято в работу\" (или FILE=комментарий.md)"
  if [[ -n "$file" ]]; then
    [[ -f "$file" ]] || die "Нет файла комментария: $file"
    dir="$INBOX/$(date +%s)-$$"
    mkdir -p "$dir"
    trap "rm -rf '$dir'" EXIT
    cp "$file" "$dir/comment.md"
    artisan pm:bug-comment "$key" --bot="$(env_get QA_BOT_EMAIL)" \
      --file="/var/www/backend/storage/app/pm-inbox/$(basename "$dir")/comment.md"
  else
    [[ -n "$text" ]] || die "Укажите текст: TEXT=\"…\" или FILE=путь/к/комментарию.md"
    artisan pm:bug-comment "$key" --bot="$(env_get QA_BOT_EMAIL)" --text="$text"
  fi
}

# -----------------------------------------------------------------------------------------------------------

command="${1:-}"
shift || true
case "$command" in
  up) cmd_up ;;
  down) cmd_down ;;
  owner) cmd_owner ;;
  update) cmd_update ;;
  _apply-update) cmd__apply_update "$@" ;;
  backup) cmd_backup ;;
  restore) cmd_restore "$@" ;;
  restore-check) cmd_restore_check "$@" ;;
  backlog) cmd_backlog "$@" ;;
  qa-bot) cmd_qa_bot ;;
  bug) cmd_bug "$@" ;;
  bug-move) cmd_bug_move "$@" ;;
  bug-show) cmd_bug_show "$@" ;;
  bugs-list) cmd_bugs_list "$@" ;;
  bug-comment) cmd_bug_comment "$@" ;;
  task) cmd_task "$@" ;;
  owner-show) cmd_owner_show ;;
  transfer-ownership) cmd_transfer_ownership "$@" ;;
  *) die "Неизвестная команда стенда: '$command'. Список — make help (pm-*)." ;;
esac
