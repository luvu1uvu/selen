#!/usr/bin/env bash
# Параллельные сессии (LATER-92; docs/runbook.md, «Параллельные сессии»). У каждой сессии своя рабочая копия: основная
# папка ~/dev/selen или копия в ~/dev/selen/.claude/worktrees/…. Dev (compose-проект selen, http://localhost:8080) один
# на машине и работает с кодом той копии, из которой его подняли, — поэтому он у одной копии за раз.
#
#   parallel.sh dev-check <цель>   — замок перед целью Makefile, которая работает с dev: dev поднят из другой копии,
#                                    проверить нельзя (docker не ответил) или у рабочей копии .env с чужими настройками
#                                    базы — отказ (код 1) с объяснением. Dev не запущен — без отказа
#   parallel.sh dev-status         — из какой копии поднят dev (make dev-status)
#   parallel.sh dev-summary        — то же одной строкой (make host-status)
#   parallel.sh dev-take           — подготовить забор dev этой копией: остановить чужой dev (make dev-take; дальше —
#                                    make up). Только с разрешения PM
#   parallel.sh env                — создать .env копии: в рабочей копии сессии — ссылка на .env основной, иначе
#                                    из шаблона
#   parallel.sh project e2e|test   — имя compose-проекта этой копии: selen-e2e-<папка>, selen-test-<папка>
#
# Какая копия держит dev — по источнику тома /var/www/backend работающего контейнера php (не по меткам compose: redis
# и mailpit без томов при чужом make up не пересоздаются). Сравнение — точное, по физическому пути: ~/dev/selen
# и ~/dev/selen/.claude/worktrees/x — разные копии, хотя вторая лежит внутри первой. Путь — от /bin/pwd -P: он, в отличие
# от встроенного pwd, отдаёт регистр букв с диска (APFS регистр не различает, а сравнение строк — различает).
set -euo pipefail

# Физический путь каталога (симлинки раскрыты, регистр — как на диске); каталога нет — как есть
physical_path() { (cd "$1" 2> /dev/null && /bin/pwd -P) || printf '%s\n' "$1"; }

COPY_DIR="$(physical_path "$(dirname "${BASH_SOURCE[0]}")/..")"
DEV_PROJECT=selen

fail() { echo "$*" >&2; exit 1; }

# docker с таймаутом: остановленная Colima не отвечает, а не падает
docker_q() { perl -e 'alarm shift; exec @ARGV' 10 docker "$@"; }

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
# DEV_ID пуст — dev не запущен. Код 1 — docker не ответил, код 2 — у контейнера нет тома кода (проверить нельзя)
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
  [[ "$source" == */backend ]] || return 2
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
# «claude, zsh» — не больше пяти имён. Подсказка PM, занята ли та копия; lsof нет — пусто. Имя вида «2.1.301» — процесс
# Claude Code (так он себя называет), в подсказке — «claude»
copy_processes() {
  command -v lsof > /dev/null || return 0
  { lsof -nP -a -d cwd -Fcn 2> /dev/null || true; } | awk -v dir="$1" '
    /^c/ { cmd = substr($0, 2); if (cmd ~ /^[0-9][0-9.]*$/) cmd = "claude" }
    /^n/ { cwd = substr($0, 2)
           if ((cwd == dir || index(cwd, dir "/") == 1) && index(cwd, dir "/.claude/worktrees/") != 1) print cmd }' \
    | sort -u | awk '{ if (NR <= 5) out = out (NR > 1 ? ", " : "") $0 } END { if (NR > 5) out = out ", …"; print out }'
}

# Основная копия (та, где лежит .git); не git — код 1
main_copy_dir() {
  local common
  common="$(git -C "$COPY_DIR" rev-parse --path-format=absolute --git-common-dir 2> /dev/null)" || return 1
  physical_path "${common%/.git}"
}

# Эта копия — рабочая копия сессии в <основная>/.claude/worktrees/… (а не основная, не стенд ~/dev/selen-pm — он тоже
# git worktree того же репозитория — и не отдельный клон). MAIN_DIR — основная копия
MAIN_DIR=""
session_copy() {
  MAIN_DIR="$(main_copy_dir || true)"
  [[ -n "$MAIN_DIR" && "$COPY_DIR" == "$MAIN_DIR"/.claude/worktrees/?* ]]
}

# Dev поднимают только основная копия и рабочие копии сессий. Стенд (~/dev/selen-pm — тоже git worktree этого
# репозитория) и копии вне .claude/worktrees — отказ: make up / fresh там работали бы с настройками стенда (COMPOSE_FILE
# в его .env) или копией, которой нет в правилах параллельных сессий
dev_copy_or_fail() {
  session_copy || [[ -z "$MAIN_DIR" || "$COPY_DIR" == "$MAIN_DIR" ]] \
    || fail "Это не копия для dev: dev поднимают из основной копии ($(tilde "$MAIN_DIR")) или рабочей копии сессии в её
.claude/worktrees/ (стенд — только make pm-*). «make ${1}» не выполнена, dev не тронут."
}

# Переменные базы из .env — без значений в выводе, только для сравнения двух файлов
env_db() { grep -E '^(DB_DATABASE|DB_USERNAME|DB_PASSWORD|DB_OWNER_USERNAME|DB_OWNER_PASSWORD)=' "$1" | LC_ALL=C sort; }

# У рабочей копии сессии свой .env (не ссылка), и настройки базы в нём не те, что у основной: dev с ним не подключится
# к базе — её роли созданы паролями основной копии. Текст — что делать (без значений)
env_mismatch() {
  session_copy || return 1
  [[ -f "$MAIN_DIR/.env" && -f "$COPY_DIR/.env" && ! -L "$COPY_DIR/.env" ]] || return 1
  [[ "$(env_db "$COPY_DIR/.env")" != "$(env_db "$MAIN_DIR/.env")" ]] || return 1
  echo "В этой копии свой .env, и настройки базы в нём не те, что в $(tilde "$MAIN_DIR")/.env: dev с ним не подключится"
  echo "к базе. Замените его ссылкой на .env основной копии и повторите:"
  echo "  rm .env && ln -s $(tilde "$MAIN_DIR")/.env .env"
}

cmd_dev_check() {
  local target="${1:-эта команда}" code=0 started processes mismatch
  dev_copy_or_fail "$target"
  dev_lookup || code=$?
  if [[ "$code" -eq 1 ]]; then
    fail "Не удалось проверить, из какой рабочей копии поднят dev: docker не ответил за 10 с. Проверьте Colima
(colima status) и повторите make ${target}."
  elif [[ "$code" -eq 2 ]]; then
    fail "Не удалось понять, из какой рабочей копии поднят dev: у контейнера php нет тома /var/www/backend.
«make ${target}» не выполнена. Попросите PM разрешить make dev-take — он пересоздаст dev из этой копии."
  fi
  if [[ -n "$DEV_ID" && "$DEV_DIR" != "$COPY_DIR" ]]; then
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
  fi
  if mismatch="$(env_mismatch)"; then
    fail "${mismatch}"
  fi
}

cmd_dev_status() {
  local code=0
  dev_lookup || code=$?
  if [[ "$code" -eq 1 ]]; then
    echo "Dev: не удалось проверить — docker не ответил (colima status)"
  elif [[ "$code" -eq 2 ]]; then
    echo "Dev запущен, но у контейнера php нет тома /var/www/backend — не понять, из какой он копии."
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
  local code=0 started
  dev_lookup || code=$?
  [[ "$code" -ne 1 ]] || { echo "не удалось проверить — docker не ответил"; return 0; }
  [[ "$code" -ne 2 ]] || { echo "запущен, но не понять, из какой копии (у php нет тома кода)"; return 0; }
  [[ -n "$DEV_ID" ]] || { echo "не запущен"; return 0; }
  started="$(dev_started)"
  echo "поднят из $(copy_describe "$DEV_DIR")${started:+, с ${started}}"
}

cmd_dev_take() {
  local code=0 mismatch
  dev_copy_or_fail dev-take
  dev_lookup || code=$?
  [[ "$code" -ne 1 ]] || fail "Docker не ответил — проверьте Colima (colima status). Dev не тронут."
  # .env копии создаёт цель .env (cmd_env) до этой команды
  if mismatch="$(env_mismatch)"; then
    fail "${mismatch}"
  fi
  if [[ "$code" -eq 2 ]]; then
    echo "Не понять, из какой копии поднят dev (у php нет тома кода), — пересоздаю из этой копии."
  elif [[ -z "$DEV_ID" ]]; then
    echo "Dev не запущен — поднимаю из этой копии."
    return 0
  elif [[ "$DEV_DIR" == "$COPY_DIR" ]]; then
    echo "Dev уже поднят из этой копии — make up."
    return 0
  else
    echo "Забираю dev у копии $(copy_describe "$DEV_DIR"): останавливаю её контейнеры (данные базы остаются)."
  fi
  # down — по имени проекта: убирает контейнеры dev, кто бы их ни поднял. Без --remove-orphans: он убил бы и идущие
  # одноразовые контейнеры проекта — проверки frontend других сессий (docker compose run node)
  docker compose --project-directory "$COPY_DIR" -f "$COPY_DIR/docker-compose.yml" down
}

cmd_env() {
  cd "$COPY_DIR"
  if [[ -L .env && ! -e .env ]]; then fail ".env — ссылка на файл, которого нет ($(readlink .env)). Удалите её: rm .env"; fi
  [[ ! -e .env ]] || return 0
  # Ссылка — только в рабочей копии сессии и только на настроенный .env (с APP_KEY: make key правит файл через sed -i,
  # а по ссылке он не работает). Не правьте .env в копии: это .env основной копии и dev любой копии
  if session_copy && grep -qE '^APP_KEY=.+' "$MAIN_DIR/.env" 2> /dev/null; then
    ln -s "$MAIN_DIR/.env" .env
    echo ".env — ссылка на .env основной копии ($(tilde "$MAIN_DIR")/.env): те же пароли базы dev и APP_KEY."
    echo "Не правьте его в этой копии — изменится .env основной копии; новая переменная — в .env.example."
  else
    # Только владельцу: в .env секреты
    (umask 077 && cp .env.example .env)
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
