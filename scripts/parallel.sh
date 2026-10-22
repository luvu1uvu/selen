#!/usr/bin/env bash
# Параллельные сессии (LATER-92; docs/runbook.md, «Параллельные сессии»). У каждой сессии своя рабочая копия: основная
# папка ~/dev/selen или копия в ~/dev/selen/.claude/worktrees/…. Dev (compose-проект selen, http://localhost:8080) один
# на машине и работает с кодом той копии, из которой его подняли, — поэтому он у одной копии за раз.
#
#   parallel.sh dev-check <цель>   — замок перед целью Makefile, которая работает с dev: dev поднят из другой копии —
#                                    отказ (код 1) с объяснением. Dev не запущен или docker не ответил — без проверки
#   parallel.sh dev-status         — из какой копии поднят dev (make dev-status)
#   parallel.sh dev-summary        — то же одной строкой (make host-status)
#   parallel.sh dev-take           — подготовить забор dev этой копией: остановить чужой dev (make dev-take; дальше —
#                                    make up). Только с разрешения PM
#   parallel.sh env                — создать .env копии: в рабочей копии — ссылка на .env основной, иначе из шаблона
#   parallel.sh project e2e|test   — имя compose-проекта этой копии: selen-e2e-<папка>, selen-test-<папка>
#
# Какая копия держит dev — по источнику тома /var/www/backend работающего контейнера php (не по меткам compose: redis
# и mailpit без томов при чужом make up не пересоздаются). Сравнение — точное, по физическому пути: ~/dev/selen
# и ~/dev/selen/.claude/worktrees/x — разные копии, хотя вторая лежит внутри первой.
set -euo pipefail

COPY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DEV_PROJECT=selen

fail() { echo "$*" >&2; exit 1; }

# docker с таймаутом: остановленная Colima не отвечает, а не падает
docker_q() { perl -e 'alarm shift; exec @ARGV' 10 docker "$@"; }

# Физический путь каталога (симлинки раскрыты); каталога нет — как есть
physical_path() { (cd "$1" 2> /dev/null && pwd -P) || printf '%s\n' "$1"; }

# Путь для сообщений: домашний каталог — «~»
tilde() { if [[ "$1" == "$HOME"/* ]]; then printf '~/%s' "${1#"$HOME"/}"; else printf '%s' "$1"; fi; }

# «~/dev/selen — ветка stage-9b» (или «без ветки, коммит …»; папки нет — так и пишем)
copy_describe() {
  local dir="$1" branch
  [[ -d "$dir" ]] || { printf '%s — папки уже нет (копию удалили)' "$(tilde "$dir")"; return 0; }
  branch="$(git -C "$dir" branch --show-current 2> /dev/null || true)"
  if [[ -n "$branch" ]]; then
    printf '%s — ветка %s' "$(tilde "$dir")" "$branch"
  else
    printf '%s — без ветки, коммит %s' "$(tilde "$dir")" "$(git -C "$dir" rev-parse --short HEAD 2> /dev/null || echo '?')"
  fi
}

# Работающий контейнер php dev: DEV_ID и DEV_DIR — физический путь копии, из которой его подняли.
# DEV_ID пуст — dev не запущен; код 1 — docker не ответил или контейнер без тома кода (проверить нельзя)
dev_lookup() {
  local source
  DEV_ID=""
  DEV_DIR=""
  DEV_ID="$(docker_q ps -q --filter "label=com.docker.compose.project=${DEV_PROJECT}" \
    --filter label=com.docker.compose.service=php --filter label=com.docker.compose.oneoff=False 2> /dev/null)" || return 1
  DEV_ID="${DEV_ID%%$'\n'*}"
  [[ -n "$DEV_ID" ]] || return 0
  source="$(docker_q inspect --format \
    '{{range .Mounts}}{{if eq .Destination "/var/www/backend"}}{{.Source}}{{end}}{{end}}' "$DEV_ID" 2> /dev/null)" || return 1
  [[ "$source" == */backend ]] || return 1
  DEV_DIR="$(physical_path "${source%/backend}")"
}

# Когда запущен dev: «22.10 14:05» (местное время); не вышло — пусто
dev_started() {
  local ts epoch
  ts="$(docker_q inspect --format '{{.State.StartedAt}}' "$DEV_ID" 2> /dev/null)" || return 0
  ts="${ts%%.*}"
  ts="${ts%Z}"
  epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "$ts" +%s 2> /dev/null || date -u -d "$ts" +%s 2> /dev/null)" || return 0
  date -r "$epoch" '+%d.%m %H:%M' 2> /dev/null || date -d "@${epoch}" '+%d.%m %H:%M' 2> /dev/null || true
}

# Программы, которые сейчас работают в копии (их текущий каталог — в ней, но не во вложенной .claude/worktrees/…):
# «claude, zsh». Подсказка PM, занята ли та копия; lsof нет — пусто
copy_processes() {
  command -v lsof > /dev/null || return 0
  { lsof -nP -a -d cwd -Fcn 2> /dev/null || true; } | awk -v dir="$1" '
    /^c/ { cmd = substr($0, 2) }
    /^n/ { cwd = substr($0, 2)
           if ((cwd == dir || index(cwd, dir "/") == 1) && index(cwd, dir "/.claude/worktrees/") != 1) print cmd }' \
    | sort -u | paste -sd ',' - | sed 's/,/, /g'
}

# Основная копия (та, где лежит .git); не git — код 1
main_copy_dir() {
  local common
  common="$(git -C "$COPY_DIR" rev-parse --path-format=absolute --git-common-dir 2> /dev/null)" || return 1
  physical_path "${common%/.git}"
}

# Переменные базы из .env — без значений в выводе, только для сравнения двух файлов
env_db() { grep -E '^(DB_DATABASE|DB_USERNAME|DB_PASSWORD|DB_OWNER_USERNAME|DB_OWNER_PASSWORD)=' "$1" | LC_ALL=C sort; }

cmd_dev_check() {
  local target="${1:-эта команда}" started processes
  dev_lookup || return 0
  [[ -n "$DEV_ID" && "$DEV_DIR" != "$COPY_DIR" ]] || return 0
  started="$(dev_started)"
  processes="$(copy_processes "$DEV_DIR")"
  {
    echo "Попросите PM разрешить make dev-take или дождитесь, пока та сессия закончит."
    echo
    echo "Dev (http://localhost:8080) поднят из другой рабочей копии:"
    echo "  $(copy_describe "$DEV_DIR")${started:+, с ${started}}"
    if [[ ! -d "$DEV_DIR" ]]; then
      :
    elif [[ -n "$processes" ]]; then
      echo "  в той копии сейчас работают программы: ${processes}"
    else
      echo "  в той копии сейчас ничего не запущено"
    fi
    echo "Эта копия: $(copy_describe "$COPY_DIR")."
    echo "«make ${target}» не выполнена: она сработала бы в чужом dev — по чужому коду и с чужими данными."
    echo "Забрать dev (другая сессия потеряет его посреди работы) — только с разрешения PM: make dev-take"
    echo "Без dev в этой копии работают make test, make lint и make e2e."
  } >&2
  return 1
}

cmd_dev_status() {
  if ! dev_lookup; then
    echo "Dev: не удалось проверить — docker не ответил (colima status)"
  elif [[ -z "$DEV_ID" ]]; then
    echo "Dev не запущен — make up поднимет его из этой копии."
  elif [[ "$DEV_DIR" == "$COPY_DIR" ]]; then
    echo "Dev поднят из этой копии: $(copy_describe "$COPY_DIR")."
  else
    echo "Dev поднят из другой копии: $(copy_describe "$DEV_DIR")."
    echo "Эта копия: $(copy_describe "$COPY_DIR")."
    echo "Забрать dev — make dev-take, только с разрешения PM."
  fi
}

cmd_dev_summary() {
  local started
  if ! dev_lookup; then echo "не удалось проверить — docker не ответил"; return 0; fi
  [[ -n "$DEV_ID" ]] || { echo "не запущен"; return 0; }
  started="$(dev_started)"
  echo "поднят из $(copy_describe "$DEV_DIR")${started:+, с ${started}}"
}

cmd_dev_take() {
  local main
  dev_lookup || fail "Docker не ответил — проверьте Colima (colima status). Dev не тронут."
  # .env копии создаёт цель .env (cmd_env) до этой команды. Свой файл с другими паролями базы — dev с ним не подключится
  # к базе: её роли созданы паролями основной копии
  main="$(main_copy_dir || true)"
  if [[ -n "$main" && "$main" != "$COPY_DIR" && -f "$main/.env" && ! -L "$COPY_DIR/.env" ]] \
    && [[ "$(env_db "$COPY_DIR/.env")" != "$(env_db "$main/.env")" ]]; then
    fail "В этой копии свой .env, и настройки базы в нём не те, что в $(tilde "$main")/.env: dev с ним не подключится
к базе. Замените его ссылкой и повторите make dev-take:
  rm .env && ln -s $(tilde "$main")/.env .env"
  fi
  if [[ -z "$DEV_ID" ]]; then
    echo "Dev не запущен — поднимаю из этой копии."
  elif [[ "$DEV_DIR" == "$COPY_DIR" ]]; then
    echo "Dev уже поднят из этой копии — make up."
  else
    echo "Забираю dev у копии $(copy_describe "$DEV_DIR"): останавливаю её контейнеры (данные базы остаются)."
    # down — по имени проекта: убирает контейнеры dev, кто бы их ни поднял; --remove-orphans — и сервисы, которых нет
    # в docker-compose.yml этой копии
    docker compose --project-directory "$COPY_DIR" -f "$COPY_DIR/docker-compose.yml" down --remove-orphans
  fi
}

cmd_env() {
  local main
  cd "$COPY_DIR"
  if [[ -L .env && ! -e .env ]]; then fail ".env — ссылка на файл, которого нет ($(readlink .env)). Удалите её: rm .env"; fi
  [[ ! -e .env ]] || return 0
  main="$(main_copy_dir || true)"
  if [[ -n "$main" && "$main" != "$COPY_DIR" && -f "$main/.env" ]]; then
    ln -s "$main/.env" .env
    echo ".env — ссылка на .env основной копии ($(tilde "$main")/.env): те же пароли базы dev и APP_KEY"
  else
    cp .env.example .env
    echo "Создан .env из .env.example"
  fi
}

# Имя compose-проекта копии: только строчные латинские буквы, цифры, «-» и «_» (правило docker compose)
cmd_project() {
  local slug
  [[ "${1:-}" == e2e || "${1:-}" == test ]] || fail "Укажите стек: parallel.sh project e2e|test"
  slug="$(basename "$COPY_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')"
  echo "selen-${1}-${slug}"
}

# Подключён через source (тест scripts/test-parallel.sh) — только функции, без команды
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

command="${1:-}"
shift || true
case "$command" in
  dev-check) cmd_dev_check "$@" ;;
  dev-status) cmd_dev_status ;;
  dev-summary) cmd_dev_summary ;;
  dev-take) cmd_dev_take ;;
  env) cmd_env ;;
  project) cmd_project "$@" ;;
  *) fail "Неизвестная команда: '${command}'. Команды — dev-check | dev-status | dev-summary | dev-take | env | project" ;;
esac
