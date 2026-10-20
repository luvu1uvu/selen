#!/usr/bin/env bash
# Mac mini — постоянный хост стенда PM (docs/runbook.md, «Mac mini как хост»; docs/adr/0018-host-and-remote-access.md).
#
#   make host-install [AGENT=backup|remote-control]   — агенты launchd (без AGENT — оба)
#   make host-status                                  — что работает, последний бэкап и копия в облаке, ВНИМАНИЕ
#   make host-uninstall [AGENT=backup|remote-control] — снять агенты
#   make host-worktrees-clean                         — удалить копии завершённых сессий Remote Control (подтверждение — в Терминале)
#   host.sh backup-job                                — задание агента бэкапов (каждый час): бэкап → копия в облако
#
# Makefile основной копии вызывает этот скрипт из рабочей копии стенда (код main), как scripts/pm.sh: агент бэкапов
# выполняет код main. Агенты — пользовательские (~/Library/LaunchAgents, от имени PM, не root): стартуют после входа
# в систему (FileVault: до входа диск зашифрован). Colima — агент Homebrew (brew services), контейнеры стенда
# поднимает Docker сам (restart: unless-stopped).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LABEL_BACKUP=local.selen.backup
LABEL_RC=local.selen.remote-control
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="${SELEN_LOG_DIR:-$HOME/Library/Logs/Selen}"
STATE_FILE="${SELEN_STATE_FILE:-$HOME/.local/state/selen/backup.state}"
CONFIG_DIR="$(dirname "$OFFSITE_ENV_FILE")"
MAIN_DIR="${SELEN_MAIN_DIR:-$HOME/dev/selen}"
# Рабочие копии сессий Remote Control (--spawn worktree): git worktree внутри основной копии
WORKTREES_DIR="$MAIN_DIR/.claude/worktrees"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
RC_NAME_PREFIX="${SELEN_RC_NAME_PREFIX:-Selen · Mac mini}"
# Обёртка сервера Remote Control — копия scripts/remote-control.sh: агент не зависит от ветки основной копии
RC_SCRIPT="$HOME/.local/share/selen/remote-control.sh"
# PATH агентов: Homebrew раньше системного (системный /usr/bin/git зависает на Связке ключей)
AGENT_PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
# Без тихих сбоев (решение PM): столько неудач подряд — уведомление; копия в облаке старше стольких часов — тоже
ALERT_FAILURES=2
OFFSITE_MAX_AGE_HOURS=6
STAND_URL="http://127.0.0.1:${PM_PORT:-8081}"

# --- Состояние задания бэкапов: KEY=value, одна строка на ключ -------------------------------------------------

state_get() { { grep -E "^$1=" "$STATE_FILE" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2-; }
state_set() {
  local key="$1" value tmp
  value="$(printf '%s' "$2" | tr '\n' ' ')"
  mkdir -p "$(dirname "$STATE_FILE")"
  tmp="$STATE_FILE.tmp.$$"
  { grep -vE "^${key}=" "$STATE_FILE" 2>/dev/null || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

when() { [[ -n "$1" ]] && date -r "$1" '+%d.%m %H:%M' || echo "—"; }
ago() {
  local s=$(( $(date +%s) - $1 ))
  if (( s < 3600 )); then echo "$((s / 60)) мин назад"; elif (( s < 172800 )); then echo "$((s / 3600)) ч назад"
  else echo "$((s / 86400)) дн назад"; fi
}

# Порты, открытые в сеть: всё, что Colima (ssh) пробрасывает из контейнеров не на 127.0.0.1 / [::1]
open_ports() {
  lsof -nP -iTCP -sTCP:LISTEN 2> /dev/null | awk '$1 == "ssh" && $9 !~ /^(127\.0\.0\.1|\[::1\]):/ { print $9 }' | sort -u
}

# Включён ли Tailscale Funnel (стенд в интернете)
funnel_on() {
  local ts serve
  ts="$(tailscale_bin || true)"
  [[ -n "$ts" ]] || return 1
  serve="$(with_timeout 10 "$ts" serve status --json 2> /dev/null || true)"
  [[ -n "$serve" ]] && jq -e '.AllowFunnel // {} | length > 0' <<< "$serve" > /dev/null 2>&1
}

# Предупреждения (ВНИМАНИЕ) — общие для уведомлений задания (каждый час) и make host-status
warnings() {
  local failures last_ok port
  for port in $(open_ports); do
    echo "Порт $port открыт в сеть (не только 127.0.0.1) — привяжите его к 127.0.0.1 в compose-файле (ADR-0018)"
  done
  if funnel_on; then
    echo "Включён Tailscale Funnel — стенд открыт в интернет! Выключить: $(tailscale_bin) funnel reset"
  fi
  if [[ "${BACKUP_KEEP_HOURLY:-0}" -le 0 ]]; then
    echo "В .env стенда нет BACKUP_KEEP_HOURLY — ежечасные бэкапы ложатся в daily/ и хранятся ~${BACKUP_KEEP_DAILY:-7} ч (make pm-update допишет)"
  fi
  failures="$(state_get BACKUP_FAILURES)"
  if [[ "${failures:-0}" -ge "$ALERT_FAILURES" ]]; then
    echo "Бэкап стенда не удался ${failures} раз подряд: $(state_get BACKUP_LAST_ERROR)"
  fi
  if offsite_disabled; then
    :   # отключена осознанно (OFFSITE_ENABLED=false) — не сбой: ни уведомлений, ни «ВНИМАНИЕ»
  elif offsite_configured; then
    failures="$(state_get OFFSITE_FAILURES)"
    last_ok="$(state_get OFFSITE_LAST_OK)"
    if [[ "${failures:-0}" -ge "$ALERT_FAILURES" ]]; then
      echo "Копия бэкапа в облако не удалась ${failures} раз подряд: $(state_get OFFSITE_LAST_ERROR)"
    fi
    if [[ -n "$last_ok" ]] && (( $(date +%s) - last_ok > OFFSITE_MAX_AGE_HOURS * 3600 )); then
      echo "Последней успешной копии в облаке больше ${OFFSITE_MAX_AGE_HOURS} ч (последняя — $(when "$last_ok"))"
    fi
  else
    echo "Копия бэкапов вне Mac mini не настроена: заполните $OFFSITE_ENV_FILE (runbook, раздел 13)"
  fi
}

notify() {
  osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv)' -e 'end run' \
    "Selen: бэкап стенда" "$1" > /dev/null 2>&1 || true
}

# --- Задание агента бэкапов ----------------------------------------------------------------------------------

cmd_backup_job() {
  local log="$LOG_DIR/backup.log" out dump warning failed=0
  mkdir -p "$LOG_DIR"
  # Лог больше 5 МБ — в backup.log.1 (хранится один предыдущий). Под launchd — только в лог, из терминала —
  # и в лог, и на экран
  if [[ -f "$log" && "$(disk_kb "$log")" -gt 5120 ]]; then mv "$log" "$log.1"; fi
  if [[ -t 1 ]]; then exec > >(tee -a "$log") 2>&1; else exec >> "$log" 2>&1; fi
  # Своя блокировка задания (не та, что у backup.sh): агент и make pm-restore-check не правят состояние одновременно
  BACKUP_LOCK="$BACKUP_DIR/.job-lock"
  backup_lock
  out="$(mktemp)"
  # Пути подставляются сейчас: на выходе локальной переменной уже нет
  trap "rm -f '$out'; rm -rf '$BACKUP_LOCK'" EXIT

  log "=== Бэкап стенда по расписанию"
  state_set BACKUP_LAST_RUN "$(date +%s)"
  if "$ROOT_DIR/scripts/backup.sh" 2>&1 | tee "$out"; then
    dump="$(tail -n 1 "$out")"
    state_set BACKUP_LAST_OK "$(date +%s)"
    state_set BACKUP_LAST_FILE "$dump"
    state_set BACKUP_LAST_SUMMARY "$(grep -o 'Бэкап готов.*' "$out" | tail -n 1)"
    state_set BACKUP_FAILURES 0
  else
    state_set BACKUP_FAILURES $(( $(state_get BACKUP_FAILURES | grep . || echo 0) + 1 ))
    state_set BACKUP_LAST_ERROR "$(grep -o 'ОШИБКА.*' "$out" | tail -n 1 || true)"
    [[ -n "$(state_get BACKUP_LAST_ERROR)" ]] || state_set BACKUP_LAST_ERROR "$(tail -n 1 "$out")"
    dump=""
    failed=1
  fi

  if [[ -n "$dump" ]]; then
    if offsite_configured; then
      if "$ROOT_DIR/scripts/backup-offsite.sh" "$dump" 2>&1 | tee "$out"; then
        state_set OFFSITE_LAST_OK "$(date +%s)"
        state_set OFFSITE_LAST_SUMMARY "$(grep -o 'Копия в облаке готова.*' "$out" | tail -n 1)"
        state_set OFFSITE_FAILURES 0
      else
        state_set OFFSITE_FAILURES $(( $(state_get OFFSITE_FAILURES | grep . || echo 0) + 1 ))
        state_set OFFSITE_LAST_ERROR "$(grep -o 'ОШИБКА.*' "$out" | tail -n 1 || tail -n 1 "$out")"
        failed=1
      fi
    elif offsite_disabled; then
      log "Копия вне Mac mini отключена (OFFSITE_ENABLED=false в $OFFSITE_ENV_FILE) — бэкап только на Mac mini"
    else
      log "Копия вне Mac mini не настроена ($OFFSITE_ENV_FILE) — пропускаю"
    fi
  fi

  while IFS= read -r warning; do
    [[ -n "$warning" ]] || continue
    log "ВНИМАНИЕ: $warning"
    notify "$warning"
  done < <(warnings)
  # Код выхода виден в make host-status (последний код выхода агента) и останавливает make pm-restore-check
  return "$failed"
}

# --- Агенты launchd ------------------------------------------------------------------------------------------

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# Свои логи агенты пишут сами (с ротацией); в launchd.log — только то, что случилось до этого (скрипт не найден)
plist_header() {
  cat <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Создан make host-install (scripts/host.sh). Не править руками: make host-install перезапишет. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(xml "$AGENT_PATH")</string>
    <key>LANG</key><string>en_US.UTF-8</string>
${2:-}  </dict>
  <key>StandardOutPath</key><string>$(xml "$LOG_DIR/launchd.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG_DIR/launchd.log")</string>
XML
}

# Каждый час в :07 (не ровно в :00 — меньше совпадений с другими задачами); после сна — сразу при пробуждении
plist_backup() {
  plist_header "$LABEL_BACKUP"
  cat <<XML
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml "$ROOT_DIR/scripts/host.sh")</string>
    <string>backup-job</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Minute</key><integer>7</integer></dict>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
XML
}

# Сервер Remote Control (claude remote-control, scripts/remote-control.sh): новые сессии — в отдельных git worktree
# основной копии. KeepAlive — launchd перезапускает сервер, если тот завершился (сеть пропала дольше ~10 минут)
plist_remote_control() {
  plist_header "$LABEL_RC" "$(cat <<XML
    <key>SELEN_MAIN_DIR</key><string>$(xml "$MAIN_DIR")</string>
    <key>CLAUDE_BIN</key><string>$(xml "$CLAUDE_BIN")</string>
    <key>SELEN_RC_NAME_PREFIX</key><string>$(xml "$RC_NAME_PREFIX")</string>
    <key>SELEN_RC_LOG</key><string>$(xml "$LOG_DIR/remote-control.log")</string>
XML
)
"
  cat <<XML
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$(xml "$RC_SCRIPT")</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
</dict>
</plist>
XML
}

# Выгрузить агент и дождаться, пока его процесс завершится (bootout асинхронный: сразу загрузить заново нельзя)
agent_unload() {
  local i
  launchctl bootout "gui/$(id -u)/$1" 2> /dev/null || return 0
  for i in $(seq 1 30); do
    launchctl print "gui/$(id -u)/$1" > /dev/null 2>&1 || return 0
    sleep 1
  done
  die "Агент $1 не выгрузился за 30 с — проверьте: launchctl print gui/$(id -u)/$1"
}

agent_load() {
  local label="$1" plist="$AGENTS_DIR/$1.plist"
  agent_unload "$label"
  launchctl enable "gui/$(id -u)/$label"
  launchctl bootstrap "gui/$(id -u)" "$plist"
  log "Агент $label загружен: $plist"
}

# Настройки копии в облако: файл ключей из шаблона (копия отключена — OFFSITE_ENABLED=false; ключи вписывает PM,
# когда копию включат) и пароль restic (генерируется здесь)
offsite_setup() {
  local password_file="$CONFIG_DIR/restic-password"
  mkdir -p "$CONFIG_DIR" && chmod 700 "$CONFIG_DIR"
  if [[ ! -f "$password_file" ]]; then
    ( umask 077; head -c 32 /dev/urandom | base64 > "$password_file" )
    log "Пароль restic создан: $password_file — положите копию в менеджер паролей (без него копию не расшифровать)"
  fi
  if [[ ! -f "$OFFSITE_ENV_FILE" ]]; then
    ( umask 077; sed -e "s|^RESTIC_PASSWORD_FILE=.*|RESTIC_PASSWORD_FILE=$password_file|" \
        "$ROOT_DIR/.env.offsite.example" > "$OFFSITE_ENV_FILE" )
    log "Создан $OFFSITE_ENV_FILE (копия вне Mac mini отключена — OFFSITE_ENABLED=false; включить — runbook, раздел 13)"
  fi
  chmod 600 "$password_file" "$OFFSITE_ENV_FILE"
  if offsite_disabled; then log "Копия вне Mac mini отключена (решение PM, до пилота) — бэкапы только на Mac mini"
  elif offsite_configured; then log "Копия в облако настроена: $RESTIC_REPOSITORY"
  else log "Копия в облако ещё не настроена — бэкапы пока только на Mac mini"; fi
}

cmd_install() {
  local what="${1:-all}"
  [[ "$what" =~ ^(all|backup|remote-control)$ ]] || die "Агент — backup или remote-control, а не «${what}»"
  [[ "$(uname)" == "Darwin" ]] || die "Агенты launchd — только для macOS"
  mkdir -p "$AGENTS_DIR" "$LOG_DIR" "$(dirname "$STATE_FILE")"
  chmod 700 "$(dirname "$STATE_FILE")"

  if [[ "$what" != "remote-control" ]]; then
    command -v restic > /dev/null || die "Не установлен restic: brew install restic"
    [[ -f "$ROOT_DIR/.env" ]] || die "Нет $ROOT_DIR/.env — стенд не создан (make pm-up)"
    # Права бэкапов: каталог — 700 (lib.sh), дампы прежних версий — 600
    find "$BACKUP_DIR" -name '*.dump' -type f -exec chmod 600 {} +
    offsite_setup
    ( umask 022; plist_backup > "$AGENTS_DIR/$LABEL_BACKUP.plist" )
    agent_load "$LABEL_BACKUP"
  fi

  if [[ "$what" != "backup" ]]; then
    [[ -x "$CLAUDE_BIN" ]] || die "Нет $CLAUDE_BIN — установите Claude Code (runbook, «Mac mini как хост»)"
    "$CLAUDE_BIN" auth status 2> /dev/null | grep -q '"loggedIn": true' \
      || die "Claude Code не вошёл в аккаунт: выполните в Терминале $CLAUDE_BIN auth login"
    [[ -d "$MAIN_DIR/.git" ]] || die "Нет основной копии Selen: $MAIN_DIR"
    mkdir -p "$(dirname "$RC_SCRIPT")"
    install -m 755 "$ROOT_DIR/scripts/remote-control.sh" "$RC_SCRIPT"
    ( umask 022; plist_remote_control > "$AGENTS_DIR/$LABEL_RC.plist" )
    agent_load "$LABEL_RC"
  fi
  log "Логи агентов: $LOG_DIR; состояние — make host-status"
}

cmd_uninstall() {
  local what="${1:-all}" label
  [[ "$what" =~ ^(all|backup|remote-control)$ ]] || die "Агент — backup или remote-control, а не «${what}»"
  for label in "$LABEL_BACKUP" "$LABEL_RC"; do
    [[ "$what" == "all" || "$label" == "local.selen.$what" ]] || continue
    agent_unload "$label"
    rm -f "$AGENTS_DIR/$label.plist"
    log "Агент $label снят"
  done
}

# --- Состояние хоста -----------------------------------------------------------------------------------------

# Команда с ограничением по времени (сеть может не отвечать): perl есть в macOS
with_timeout() { perl -e 'alarm shift; exec @ARGV' "$@"; }

# --- Рабочие копии сессий Remote Control ----------------------------------------------------------------------
# Сессия Remote Control — git worktree $WORKTREES_DIR/bridge-<id сессии> (id — «cse_…») на ветке
# worktree-bridge-<id>; процесс сессии работает внутри копии (его текущий каталог там). Копию блокирует сервер:
# git worktree lock с причиной «claude agent bridge-<id> (pid N start <запуск>)», где pid — сам сервер, а время
# запуска — в UTC (формат сверен на живой копии сервера, LATER-69). Копия считается занятой (не удаляется), пока внутри
# работает хоть один процесс или жив процесс из блокировки. Под тем же pid после перезагрузки может оказаться другой
# процесс — тогда время запуска не совпадёт, и блокировка считается брошенной.
# В $WORKTREES_DIR лежат и копии сессий приложения Claude и claude --worktree: очистка их не трогает (решение PM,
# LATER-69) — процесс простаивающей сессии приложения может завершиться, а сама сессия ещё нужна.
RC_WORKTREE_RE='^bridge-cse_[A-Za-z0-9]+$'

# Текущие каталоги процессов пользователя — строки «pid каталог» (один раз на запуск команды). В выводе всегда есть
# хотя бы сам скрипт: пусто — lsof не сработал, и проверить, работают ли сессии, нельзя
process_cwds() {
  { lsof -nP -a -d cwd -Fpn 2> /dev/null || true; } | awk '/^p/ { pid = substr($0, 2) } /^n/ { print pid " " substr($0, 2) }'
}

# Файлы docker compose запущенных проектов: контейнеры работают в VM Colima, lsof их не видит, а стек, поднятый
# из копии сессии, после её удаления остался бы с bind-mount на удалённый каталог. docker не ответил (Colima
# остановлена, таймаут) — код 1: проверить нельзя. docker не установлен — стеков нет
compose_files() {
  local out
  command -v docker > /dev/null 2>&1 || return 0
  out="$(with_timeout 10 docker compose ls --format json 2> /dev/null)" || return 1
  jq -r '.[].ConfigFiles // empty' <<< "$out" 2> /dev/null | tr ',' '\n'
}

# Жив ли процесс с этим pid и тем же временем запуска, что в причине блокировки (в UTC или местном времени)
lock_owner_alive() {
  local lock pid="$2" started
  lock="$(tr -s ' ' <<< "$1")"
  for started in \
    "$(TZ=UTC LC_ALL=C ps -o lstart= -p "$pid" 2> /dev/null | tr -s ' ' | sed 's/^ //; s/ $//')" \
    "$(LC_ALL=C ps -o lstart= -p "$pid" 2> /dev/null | tr -s ' ' | sed 's/^ //; s/ $//')"; do
    [[ -n "$started" && "$lock" == *"start $started)"* ]] && return 0
  done
  return 1
}

# Рабочие копии в $WORKTREES_DIR — строки «путь|коммит|ветка|причина блокировки» (ветка пуста у отсоединённой HEAD,
# причина — если копия не заблокирована; «-» — заблокирована без причины). Причина — последней: в ней бывает «|»
session_worktrees() {
  git -C "$MAIN_DIR" worktree list --porcelain 2> /dev/null | awk -v dir="$WORKTREES_DIR/" '
    /^worktree / { path = substr($0, 10); head = ""; branch = ""; lock = "" }
    /^HEAD / { head = substr($0, 6) }
    /^branch / { branch = substr($0, 8); sub(/^refs\/heads\//, "", branch) }
    /^locked/ { lock = (length($0) > 7) ? substr($0, 8) : "-" }
    /^$/ { if (index(path, dir) == 1) print path "|" head "|" branch "|" lock }'
}

# Игнорируемые git файлы, которые не жалко: зависимости и кеши (пересоздаются). Любой другой игнорируемый файл
# (дамп в backups/, .env, .pm-bugs/…) — повод оставить копию: git worktree remove удалил бы его молча
REGENERABLE_RE='(^|/)(node_modules|vendor|test-results|playwright-report|\.auth|\.attachments|dist|coverage|\.vite)/$|^backend/(storage/(framework|logs)|bootstrap/cache)/|(^|/)\.DS_Store$|\.phpunit\.(result\.)?cache'

# Изменения и файлы вне git в копии — вывод git status, который не зависит от настроек git (LATER-69): при
# status.showUntrackedFiles=no git скрывает не только неотслеживаемые, но и игнорируемые файлы (.env, дампы).
# --untracked-files=normal, а не all: с all игнорируемые каталоги раскрылись бы по файлам (node_modules — тысячи
# строк мимо REGENERABLE_RE). --no-optional-locks — проверка не обновляет индекс копии и не берёт index.lock
worktree_git_status() {
  git --no-optional-locks -C "$1" status --porcelain=v1 --no-branch --untracked-files=normal --ignored=traditional \
    --ignore-submodules=none
}

# Почему рабочую копию удалять нельзя; пусто — можно: это копия сессии Remote Control, внутри не работает ни один
# процесс и не запущен docker-стек, блокировка — сервера Remote Control и брошена (или её нет), нет изменений и
# файлов вне git, кроме кешей, и нет коммитов, которых нет на GitHub.
# Аргументы: путь, ветка, причина блокировки, вывод process_cwds, вывод compose_files. Любой сбой проверки — «оставить».
worktree_keep_reason() {
  local path="$1" lock="$3" cwds="$4" compose="$5" name lock_re pid status extra unpushed
  name="${path##*/}"
  [[ "$name" =~ $RC_WORKTREE_RE && "$path" == "$WORKTREES_DIR/$name" ]] || { echo "не Remote Control"; return; }
  pid="$(awk -v dir="$path" '{ cwd = substr($0, index($0, " ") + 1) } cwd == dir || index(cwd, dir "/") == 1 { print $1; exit }' <<< "$cwds")" \
    || { echo "не удалось проверить процессы"; return; }
  [[ -z "$pid" ]] || { echo "сессия работает: внутри процесс $pid"; return; }
  if [[ "$compose" == *"$path/"* ]]; then echo "из копии запущен docker-стек — остановите его (docker compose ls)"; return; fi
  if [[ -n "$lock" ]]; then
    lock_re="^claude agent $name \\(pid ([0-9]+) start [^()]+\\)\$"
    [[ "$lock" =~ $lock_re ]] || { echo "заблокирована не сервером Remote Control: $lock"; return; }
    pid="${BASH_REMATCH[1]}"
    if lock_owner_alive "$lock" "$pid"; then echo "заблокирована работающим сервером Remote Control (pid $pid)"; return; fi
  fi
  [[ -d "$path" ]] || { echo "каталога нет — git worktree prune"; return; }
  status="$(worktree_git_status "$path" 2> /dev/null)" || { echo "не удалось проверить изменения (git status)"; return; }
  if grep -q '^[^!]' <<< "$status"; then echo "есть незакоммиченные изменения"; return; fi
  # grep без строк — код 1 (файлов вне git нет), код 2 — сбой: тогда «оставить»
  extra="$(sed -n 's/^!! //p' <<< "$status" | { grep -Ev "$REGENERABLE_RE" || [[ $? -eq 1 ]]; })" \
    || { echo "не удалось проверить файлы вне git"; return; }
  [[ -z "$extra" ]] || { echo "есть файлы вне git (например, ${extra%%$'\n'*})"; return; }
  unpushed="$(git -C "$path" rev-list -n 1 HEAD --not --remotes 2> /dev/null)" \
    || { echo "не удалось проверить коммиты (git rev-list)"; return; }
  [[ -z "$unpushed" ]] || { echo "есть коммиты, которых нет на GitHub"; return; }
}

# Для make host-status: «N, из них завершённых без изменений — M»
worktrees_summary() {
  local path head branch lock cwds compose total=0 clean=0
  cwds="$(process_cwds)"
  if [[ -z "$cwds" ]]; then
    echo "$(session_worktrees | grep -c . || true), не проверены: lsof не сработал"
    return
  fi
  if ! compose="$(compose_files)"; then
    echo "$(session_worktrees | grep -c . || true), не проверены: docker compose ls не сработал"
    return
  fi
  while IFS='|' read -r path head branch lock; do
    total=$((total + 1))
    [[ -n "$(worktree_keep_reason "$path" "$branch" "$lock" "$cwds" "$compose")" ]] || clean=$((clean + 1))
  done < <(session_worktrees)
  if (( clean > 0 )); then echo "$total, из них завершённых без изменений — $clean: make host-worktrees-clean"
  else echo "$total, завершённых без изменений нет"; fi
}

# Подтверждение удаления — только человеком в терминале: «echo y | make host-worktrees-clean» (в том числе от
# агента) ничего не удаляет. Код 0 — удалять
confirm_removal() {
  local answer
  if [[ ! -t 0 ]]; then
    echo "Удалить можно только с подтверждением в окне Терминала (make host-worktrees-clean). Ничего не удалено."
    return 1
  fi
  printf 'Удалить рабочих копий: %s? [y/N] ' "$1"
  read -r answer || answer=""
  case "$answer" in
    y | Y | yes | д | Д | да) return 0 ;;
    *) echo "Отменено, ничего не удалено."; return 1 ;;
  esac
}

# Перед удалением каждой копии — все проверки заново (LATER-69): пока PM отвечал на вопрос, в копии могла начаться
# работа. Аргументы — путь, коммит, ветка и блокировка на момент вопроса; вывод — почему не удалять (пусто — удалять)
worktree_recheck() {
  local path="$1" cwds compose line now_path now_head now_branch now_lock reason
  cwds="$(process_cwds)"
  [[ -n "$cwds" ]] || { echo "не удалось проверить процессы (lsof)"; return; }
  compose="$(compose_files)" || { echo "не удалось проверить docker-стеки (docker compose ls)"; return; }
  while IFS= read -r line; do [[ "${line%%|*}" != "$path" ]] || break; line=""; done < <(session_worktrees)
  [[ -n "$line" ]] || { echo "копии уже нет в списке git worktree"; return; }
  IFS='|' read -r now_path now_head now_branch now_lock <<< "$line"
  reason="$(worktree_keep_reason "$path" "$now_branch" "$now_lock" "$cwds" "$compose")"
  if [[ -n "$reason" ]]; then echo "$reason"
  elif [[ "$now_head|$now_branch" != "$2|$3" ]]; then echo "после вопроса в копии новый коммит или другая ветка"
  elif [[ "$now_lock" != "$4" ]]; then echo "после вопроса изменилась блокировка"; fi
}

# Удалить копию, которую worktree_recheck только что признал завершённой. Блокировку снимаем только здесь — после
# перепроверки; если git отказался удалять, блокировка возвращается как была
worktree_remove() {
  local path="$1" branch="$2" lock="$3" name="${1##*/}"
  if [[ -n "$lock" ]] && ! git -C "$MAIN_DIR" worktree unlock "$path"; then
    echo "  ${name}: НЕ удалена (не удалось снять брошенную блокировку — см. сообщение выше)"
    return
  fi
  # Без --force: если в копии что-то появилось, git откажется удалять. showUntrackedFiles=all — внутренняя
  # проверка git видит неотслеживаемые файлы при любой настройке (с «no» git удалил бы их молча)
  if ! git -c status.showUntrackedFiles=all -C "$MAIN_DIR" worktree remove "$path"; then
    [[ -z "$lock" ]] || git -C "$MAIN_DIR" worktree lock --reason "$lock" "$path" || true
    echo "  ${name}: НЕ удалена (git worktree remove отказался — см. сообщение выше)"
    return
  fi
  # Безопасное удаление ветки: git откажется, если её коммиты никуда не слиты, — тогда ветка остаётся
  if [[ -n "$branch" ]] && ! git -C "$MAIN_DIR" branch -d "$branch" > /dev/null 2>&1; then
    echo "  ${name}: удалена; ветка ${branch} оставлена (не слита — удалите сами, если она не нужна)"
  else
    echo "  ${name}: удалена"
  fi
}

cmd_worktrees_clean() {
  local path head branch lock cwds compose reason item removable=() kept=()
  cwds="$(process_cwds)"
  [[ -n "$cwds" ]] || die "Не удалось получить список процессов (lsof) — нельзя проверить, какие сессии работают. Ничего не удалено."
  compose="$(compose_files)" \
    || die "docker не ответил (docker compose ls) — нельзя проверить, не запущен ли стек из копии. Работает ли Colima — make host-status. Ничего не удалено."
  while IFS='|' read -r path head branch lock; do
    reason="$(worktree_keep_reason "$path" "$branch" "$lock" "$cwds" "$compose")"
    if [[ -z "$reason" ]]; then removable+=("$path|$head|$branch|$lock"); else kept+=("${path##*/} — ${reason}"); fi
  done < <(session_worktrees)

  printf 'Рабочие копии сессий (%s); удаляются только копии Remote Control\n\n' "$WORKTREES_DIR"
  if [[ ${#kept[@]} -gt 0 ]]; then
    echo "Оставлены:"
    printf '  %s\n' "${kept[@]}"
    echo
  fi
  if [[ ${#removable[@]} -eq 0 ]]; then
    echo "Удалять нечего: завершённых сессий Remote Control без изменений нет."
    return
  fi
  echo "Можно удалить (сессия завершена, изменений и файлов вне git нет, кроме кешей; все коммиты есть на GitHub):"
  for item in "${removable[@]}"; do
    IFS='|' read -r path head branch lock <<< "$item"
    printf '  %s — ветка %s, %s\n' "${path##*/}" "${branch:-(без ветки)}" \
      "$(git -C "$path" log -1 --format='%cd · %s' --date=format:'%d.%m %H:%M' 2> /dev/null)"
  done
  echo
  confirm_removal "${#removable[@]}" || return 0

  for item in "${removable[@]}"; do
    IFS='|' read -r path head branch lock <<< "$item"
    reason="$(worktree_recheck "$path" "$head" "$branch" "$lock")"
    if [[ -n "$reason" ]]; then
      echo "  ${path##*/}: НЕ удалена — ${reason}"
      continue
    fi
    worktree_remove "$path" "$branch" "$lock"
  done
}

agent_state() {
  local info
  info="$(launchctl print "gui/$(id -u)/$1" 2> /dev/null)" || { echo "не установлен (make host-install)"; return; }
  if grep -qE '^\s*state = running' <<< "$info"; then
    echo "работает (pid $(grep -E '^\s*pid = ' <<< "$info" | awk '{ print $3 }'))"
  else
    echo "загружен, ждёт запуска (последний код выхода: $(grep -E 'last exit code' <<< "$info" | awk -F'= ' '{ print $2 }'))"
  fi
}

tailscale_bin() {
  command -v tailscale 2> /dev/null && return
  [[ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]] && echo /Applications/Tailscale.app/Contents/MacOS/Tailscale
}

cmd_status() {
  local code ts dns serve last_ok file summary attention=()
  printf 'Хост Selen — %s, %s\n\n' "$(scutil --get ComputerName 2> /dev/null || hostname -s)" "$(date '+%d.%m.%Y %H:%M')"

  if colima status > /dev/null 2>&1; then echo "Colima:           работает"
  else echo "Colima:           НЕ работает"; attention+=("Colima не запущена: brew services restart colima"); fi

  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$STAND_URL/up" || true)"
  if [[ "$code" == "200" ]]; then echo "Стенд PM:         работает — $STAND_URL"
  else echo "Стенд PM:         НЕ отвечает ($STAND_URL/up → ${code:-нет ответа})"; attention+=("Стенд не отвечает: make pm-up"); fi

  ts="$(tailscale_bin || true)"
  if [[ -z "$ts" ]]; then
    echo "Tailscale:        не установлен"
  elif ! dns="$(with_timeout 10 "$ts" status --json 2> /dev/null | jq -r '.Self.DNSName // empty' | sed 's/\.$//')" \
    || [[ -z "$dns" ]]; then
    echo "Tailscale:        не подключён"; attention+=("Tailscale не подключён — стенд недоступен с MacBook")
  else
    serve="$(with_timeout 10 "$ts" serve status --json 2> /dev/null || true)"
    [[ -n "$serve" ]] || serve='{}'
    if jq -e '.Web // {} | length > 0' <<< "$serve" > /dev/null 2>&1; then
      echo "Tailscale:        https://$dns (только внутри tailnet)"
    else
      echo "Tailscale:        $dns, но стенд не опубликован (tailscale serve — runbook)"
    fi
  fi

  echo "Remote Control:   $(agent_state "$LABEL_RC")"
  echo "Агент бэкапов:    $(agent_state "$LABEL_BACKUP")"
  echo "Копии сессий:     $(worktrees_summary)"
  echo

  last_ok="$(state_get BACKUP_LAST_OK)"
  file="$(state_get BACKUP_LAST_FILE)"
  summary="$(state_get BACKUP_LAST_SUMMARY)"
  if [[ -n "$last_ok" ]]; then
    echo "Последний бэкап:  $(when "$last_ok") ($(ago "$last_ok")) — ${summary#Бэкап готов }"
    echo "                  ${file#"$BACKUP_DIR"/}"
    (( $(date +%s) - last_ok <= 7200 )) || attention+=("Последний успешный бэкап — больше 2 ч назад: агент бэкапов не работает или бэкапы падают")
  else
    echo "Последний бэкап:  по расписанию ещё не было"
  fi
  echo "Бэкапы на диске:  $(human_kb "$(disk_kb "$BACKUP_DIR")") — $BACKUP_DIR"

  if offsite_disabled; then
    echo "Копия вне Mac mini: отключена (решение PM, до пилота)"
  elif offsite_configured; then
    last_ok="$(state_get OFFSITE_LAST_OK)"
    if [[ -n "$last_ok" ]]; then
      echo "Копия в облаке:   $(when "$last_ok") ($(ago "$last_ok")) — ${RESTIC_REPOSITORY}"
    else
      echo "Копия в облаке:   ещё не было — ${RESTIC_REPOSITORY}"
      attention+=("В облаке ещё нет ни одной копии бэкапа")
    fi
  else
    echo "Копия в облаке:   не настроена ($OFFSITE_ENV_FILE)"
  fi

  while IFS= read -r line; do [[ -z "$line" ]] || attention+=("$line"); done < <(warnings)
  echo
  if [[ ${#attention[@]} -eq 0 ]]; then
    echo "Всё в порядке."
  else
    printf 'ВНИМАНИЕ: %s\n' "${attention[@]}"
  fi
  printf '\nЛоги: %s (backup.log, remote-control.log); Colima — /opt/homebrew/var/log/colima.log\n' "$LOG_DIR"
}

# -----------------------------------------------------------------------------------------------------------

# Подключён через source (тест scripts/test-host-worktrees.sh) — только функции, без команды
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

command="${1:-}"
shift || true
case "$command" in
  install) cmd_install "$@" ;;
  uninstall) cmd_uninstall "$@" ;;
  status) cmd_status ;;
  worktrees-clean) cmd_worktrees_clean ;;
  backup-job) cmd_backup_job ;;
  *) die "Неизвестная команда: '$command'. Команды — make host-install | host-status | host-uninstall | host-worktrees-clean" ;;
esac
