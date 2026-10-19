#!/usr/bin/env bash
# Mac mini — постоянный хост стенда PM (docs/runbook.md, «Mac mini как хост»; docs/adr/0018-host-and-remote-access.md).
#
#   make host-install [AGENT=backup|remote-control]   — агенты launchd (без AGENT — оба)
#   make host-status                                  — что работает, последний бэкап и копия в облаке, ВНИМАНИЕ
#   make host-uninstall [AGENT=backup|remote-control] — снять агенты
#   host.sh backup-job                                — задание агента бэкапов (каждый час): бэкап → копия в облако
#
# Makefile основной копии вызывает этот скрипт из рабочей копии стенда (код main), как scripts/pm.sh: агент бэкапов
# выполняет код main. Агенты — пользовательские (~/Library/LaunchAgents, от имени PM, не root): стартуют после входа
# в систему (FileVault: до входа диск зашифрован). Colima — агент Homebrew (brew services), контейнеры стенда
# поднимает Docker сам (restart: unless-stopped).

source "$(dirname "$0")/lib.sh"

LABEL_BACKUP=local.selen.backup
LABEL_RC=local.selen.remote-control
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="${SELEN_LOG_DIR:-$HOME/Library/Logs/Selen}"
STATE_FILE="${SELEN_STATE_FILE:-$HOME/.local/state/selen/backup.state}"
CONFIG_DIR="$(dirname "$OFFSITE_ENV_FILE")"
MAIN_DIR="${SELEN_MAIN_DIR:-$HOME/dev/selen}"
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

command="${1:-}"
shift || true
case "$command" in
  install) cmd_install "$@" ;;
  uninstall) cmd_uninstall "$@" ;;
  status) cmd_status ;;
  backup-job) cmd_backup_job ;;
  *) die "Неизвестная команда: '$command'. Команды — make host-install | host-status | host-uninstall" ;;
esac
