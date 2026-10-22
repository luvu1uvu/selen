#!/usr/bin/env bash
# Тест параллельных сессий (scripts/parallel.sh, LATER-92): make lint и CI. Во временном каталоге — основная копия
# и рабочая копия в .claude/worktrees/ со своими scripts/parallel.sh; docker — подмена в PATH: «работающий dev» — файлы
# $TMP/dev.id (контейнер) и $TMP/dev.source (источник тома /var/www/backend), $TMP/docker.fail — docker «не ответил»,
# вызовы docker compose пишутся в $TMP/docker.log. Плюс проверка Makefile: каждая цель, которая работает с dev, —
# с замком первой строкой. Настоящий docker, dev, .env и настройки git не затрагиваются.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

# Процесс, работающий внутри копии (как процесс сессии); stop_busy — завершить все такие процессы
busy() { (cd "$1" && exec sleep 300) & echo "$!" >> "$TMP/busy.pids"; disown "$!"; sleep 1; }
stop_busy() { [[ ! -f "$TMP/busy.pids" ]] || { kill $(cat "$TMP/busy.pids") 2> /dev/null || true; rm -f "$TMP/busy.pids"; }; }

TMP="$(mktemp -d)"
trap 'stop_busy; rm -rf "$TMP"' EXIT
# Настоящий путь (macOS: /var → /private/var): так его видят git, lsof и pwd -P
TMP="$(cd "$TMP" && pwd -P)"
export HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/home/.config" GIT_CONFIG_GLOBAL="$TMP/home/.gitconfig" GIT_CONFIG_NOSYSTEM=1
mkdir -p "$HOME/dev" "$TMP/bin"
git config --global user.name "Тест"
git config --global user.email test@example.com
git config --global init.defaultBranch main

cat > "$TMP/bin/docker" << EOF
#!/usr/bin/env bash
[[ ! -f "$TMP/docker.fail" ]] || exit 1
case "\$1" in
  ps) cat "$TMP/dev.id" 2> /dev/null || true ;;
  inspect)
    case "\$3" in
      *Mounts*) cat "$TMP/dev.source" ;;
      *StartedAt*) echo "2026-10-22T11:05:00.123456789Z" ;;
    esac ;;
  compose) echo "\$*" >> "$TMP/docker.log" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$TMP/bin/docker"
export PATH="$TMP/bin:$PATH"

failed=0
total=0
fail() { failed=$((failed + 1)); echo "ПРОВАЛ: $*"; }

# Основная копия ~/dev/selen (ветка main) и рабочая копия сессии ~/dev/selen/.claude/worktrees/bridge-cse_01AbC
MAIN="$HOME/dev/selen"
WT="$MAIN/.claude/worktrees/bridge-cse_01AbC"
git init -q "$MAIN"
mkdir -p "$MAIN/scripts"
cp "$ROOT/scripts/parallel.sh" "$MAIN/scripts/"
printf '%s\n' 'DB_PASSWORD=secret' 'APP_KEY=' > "$MAIN/.env.example"
printf '%s\n' '.env' '/.claude/worktrees/' > "$MAIN/.gitignore"
git -C "$MAIN" add .
git -C "$MAIN" commit -qm init
git -C "$MAIN" worktree add -q -b worktree-bridge-cse_01AbC "$WT"

dev_from() { echo abc123 > "$TMP/dev.id"; echo "$1/backend" > "$TMP/dev.source"; }
dev_down() { rm -f "$TMP/dev.id" "$TMP/dev.source"; }

# run <копия> <аргументы…> — код в $code, stdout — $TMP/out, stderr — $TMP/err
run() {
  local copy="$1"
  shift
  code=0
  (cd "$TMP" && "$copy/scripts/parallel.sh" "$@") > "$TMP/out" 2> "$TMP/err" || code=$?
}
# expect <код> <что проверяем>
expect() {
  total=$((total + 1))
  [[ "$code" -eq "$1" ]] || { fail "$2: код ${code}, ожидали $1"; sed 's/^/    | /' "$TMP/out" "$TMP/err"; }
}
# has <файл out|err> <фрагмент> <что проверяем>; lacks — фрагмента нет
has() { total=$((total + 1)); grep -qF -- "$2" "$TMP/$1" || fail "$3: в ${1} нет «$2»"; }
lacks() { total=$((total + 1)); ! grep -qF -- "$2" "$TMP/$1" || fail "$3: в ${1} есть «$2»"; }
silent() { total=$((total + 1)); [[ ! -s "$TMP/out" && ! -s "$TMP/err" ]] || fail "$1: есть вывод"; }

# --- Имена стеков: у каждой копии свои ------------------------------------------------------------------------
run "$MAIN" project e2e
total=$((total + 1)); [[ "$(cat "$TMP/out")" == "selen-e2e-selen" ]] || fail "имя E2E основной копии: $(cat "$TMP/out")"
run "$WT" project test
total=$((total + 1)); [[ "$(cat "$TMP/out")" == "selen-test-bridge-cse_01abc" ]] || fail "имя стека тестов копии: $(cat "$TMP/out")"
mkdir -p "$TMP/My.Copy 2/scripts" && cp "$ROOT/scripts/parallel.sh" "$TMP/My.Copy 2/scripts/"
run "$TMP/My.Copy 2" project e2e
total=$((total + 1)); [[ "$(cat "$TMP/out")" == "selen-e2e-my-copy-2" ]] || fail "имя с точкой и пробелом: $(cat "$TMP/out")"
run "$MAIN" project prod
expect 1 "неизвестный стек"

# --- Замок: одна сессия работает как раньше --------------------------------------------------------------------
dev_down
run "$WT" dev-check fresh
expect 0 "dev не запущен"
silent "dev не запущен"
dev_from "$WT"
run "$WT" dev-check fresh
expect 0 "dev из этой рабочей копии"
silent "dev из этой рабочей копии"
dev_from "$MAIN"
run "$MAIN" dev-check fresh
expect 0 "dev из этой основной копии"
silent "dev из этой основной копии"
ln -s "$MAIN" "$TMP/link"
dev_from "$TMP/link"
run "$MAIN" dev-check fresh
expect 0 "dev поднят по пути через симлинк на эту копию"
# Регистр букв в пути: APFS его не различает — dev, поднятый по пути в другом регистре, — та же копия
if [[ -d "$HOME/DEV/SELEN" ]]; then
  dev_from "$HOME/DEV/SELEN"
  run "$MAIN" dev-check fresh
  expect 0 "dev поднят по пути в другом регистре (APFS)"
fi

# --- Замок: проверить нельзя — отказ (команда пошла бы в тот же docker вслепую) --------------------------------
touch "$TMP/docker.fail"
run "$WT" dev-check fresh
expect 1 "docker не ответил"
has err "docker не ответил за 10 с" "docker не ответил: почему"
has err "colima status" "docker не ответил: что делать"
rm -f "$TMP/docker.fail"
echo abc123 > "$TMP/dev.id" && echo "" > "$TMP/dev.source"
run "$WT" dev-check fresh
expect 1 "у контейнера php нет тома кода"
has err "нет тома /var/www/backend" "нет тома: почему"

# --- Замок: dev чужой копии -----------------------------------------------------------------------------------
dev_from "$MAIN"
run "$WT" dev-check fresh
expect 1 "рабочая копия, dev из основной"
total=$((total + 1))
[[ "$(head -n 1 "$TMP/err")" == "Попросите PM разрешить make dev-take или дождитесь, пока та сессия закончит." ]] \
  || fail "первая строка отказа: $(head -n 1 "$TMP/err")"
has err "поднят из другой рабочей копии:" "отказ"
has err "  ~/dev/selen — ветка main, с " "отказ: чья копия, ветка, время"
has err "Эта копия: ~/dev/selen/.claude/worktrees/bridge-cse_01AbC — ветка worktree-bridge-cse_01AbC." "отказ: эта копия"
has err "«make fresh» не выполнена" "отказ: какая команда"
has err "только с разрешения PM: make dev-take" "отказ: как забрать"
total=$((total + 1)); [[ ! -s "$TMP/out" ]] || fail "отказ — не в stdout"

# Сессия в основной папке, dev — из рабочей копии (основная папка — такая же копия, как любая)
dev_from "$WT"
run "$MAIN" dev-check migrate
expect 1 "основная копия, dev из рабочей"
has err "  ~/dev/selen/.claude/worktrees/bridge-cse_01AbC — ветка worktree-bridge-cse_01AbC" "отказ в основной копии"
has err "«make migrate» не выполнена" "отказ в основной копии: команда"

# Копию, из которой подняли dev, уже удалили
dev_from "$TMP/gone"
run "$WT" dev-check up
expect 1 "dev из удалённой копии"
has err "$TMP/gone — папки уже нет (копию удалили)" "удалённая копия"

if command -v lsof > /dev/null; then
  # Подсказка «занята ли та копия»: процесс во вложенной рабочей копии — не процесс основной
  dev_from "$MAIN"
  busy "$WT"
  run "$WT" dev-check fresh
  has err "в той копии сейчас ничего не запущено" "процессы: только во вложенной копии"
  busy "$MAIN"
  run "$WT" dev-check fresh
  has err "в той копии сейчас работают программы: sleep" "процессы в той копии"
  stop_busy
fi

# --- dev-status --------------------------------------------------------------------------------------------------
dev_down
run "$WT" dev-status
has out "Dev не запущен" "dev-status: не запущен"
dev_from "$WT"
run "$WT" dev-status
has out "Dev поднят из этой копии: ~/dev/selen/.claude/worktrees/bridge-cse_01AbC" "dev-status: своя"
dev_from "$MAIN"
run "$WT" dev-status
has out "Dev поднят из другой копии: ~/dev/selen — ветка main." "dev-status: чужая"
run "$WT" dev-summary
total=$((total + 1)); [[ "$(cat "$TMP/out")" == "поднят из ~/dev/selen — ветка main, с "* ]] || fail "dev-summary: $(cat "$TMP/out")"

# --- .env: в рабочей копии — ссылка на .env основной -------------------------------------------------------------
run "$MAIN" env
total=$((total + 1)); [[ -f "$MAIN/.env" && ! -L "$MAIN/.env" ]] || fail "основная копия: .env не создан из шаблона"
total=$((total + 1))
[[ "$(ls -l "$MAIN/.env" | cut -c1-10)" == "-rw-------" ]] || fail ".env из шаблона — не 600: $(ls -l "$MAIN/.env" | cut -c1-10)"
# .env основной копии без APP_KEY (не настроен) — рабочая копия получает свой из шаблона: make key по ссылке не работает
run "$WT" env
total=$((total + 1)); [[ -f "$WT/.env" && ! -L "$WT/.env" ]] || fail "основная без APP_KEY: в рабочей копии не свой .env"
rm "$WT/.env"
printf '%s\n' 'DB_PASSWORD=mainmainmain' 'APP_KEY=base64:dGVzdA==' > "$MAIN/.env"
run "$WT" env
total=$((total + 1)); [[ "$(readlink "$WT/.env")" == "$MAIN/.env" ]] || fail "рабочая копия: .env не ссылка на основной"
has out "ссылка на .env основной копии (~/dev/selen/.env)" "сообщение о ссылке"
total=$((total + 1)); [[ -z "$(git -C "$WT" status --porcelain)" ]] || fail "ссылка .env видна git: $(git -C "$WT" status --porcelain)"
run "$WT" env
expect 0 "повтор: .env уже есть"
rm "$WT/.env" && ln -s "$TMP/none.env" "$WT/.env"
run "$WT" env
expect 1 "ссылка в никуда"
has err "Удалите её: rm .env" "ссылка в никуда: что делать"
rm "$WT/.env"

# --- dev-take ----------------------------------------------------------------------------------------------------
rm -f "$TMP/docker.log"
echo "DB_PASSWORD=copycopycopy" > "$WT/.env"
dev_from "$MAIN"
run "$WT" dev-take
expect 1 "свой .env с другими паролями базы"
has err "настройки базы в нём не те" "dev-take: другой .env"
has err "rm .env && ln -s ~/dev/selen/.env .env" "dev-take: как исправить"
lacks err "mainmainmain" "dev-take: пароль не печатается"
lacks err "copycopycopy" "dev-take: пароль копии не печатается"
total=$((total + 1)); [[ ! -f "$TMP/docker.log" ]] || fail "dev-take с другим .env остановил dev"
cp "$MAIN/.env" "$WT/.env"
run "$WT" dev-take
expect 0 "свой .env с теми же настройками базы"
rm "$WT/.env" && ln -s "$MAIN/.env" "$WT/.env"
rm -f "$TMP/docker.log"
run "$WT" dev-take
expect 0 "dev-take из рабочей копии"
has out "Забираю dev у копии ~/dev/selen — ветка main" "dev-take: у кого"
total=$((total + 1)); grep -q " down$" "$TMP/docker.log" 2> /dev/null || fail "dev-take не остановил чужой dev: $(cat "$TMP/docker.log" 2> /dev/null)"
# Без --remove-orphans: он убил бы идущие одноразовые контейнеры проекта — проверки frontend других сессий
total=$((total + 1)); ! grep -q "remove-orphans" "$TMP/docker.log" || fail "dev-take убирает одноразовые контейнеры других сессий"
rm -f "$TMP/docker.log"
dev_from "$WT"
run "$WT" dev-take
has out "Dev уже поднят из этой копии" "dev-take: уже своя"
total=$((total + 1)); [[ ! -f "$TMP/docker.log" ]] || fail "dev-take остановил свой dev"
dev_down
run "$WT" dev-take
has out "Dev не запущен" "dev-take: dev не запущен"

# Свой .env с другими настройками базы — замок и для make up, когда dev не запущен
rm "$WT/.env" && echo "DB_PASSWORD=copycopycopy" > "$WT/.env"
run "$WT" dev-check up
expect 1 "make up со своим .env с другими паролями базы"
has err "настройки базы в нём не те" "make up: другой .env"
rm "$WT/.env"

# --- Стенд (~/dev/selen-pm — git worktree того же репозитория, но не копия для dev) -----------------------------
PM="$HOME/dev/selen-pm"
git -C "$MAIN" worktree add -q -b pm-stand "$PM"
run "$PM" env
total=$((total + 1)); [[ -f "$PM/.env" && ! -L "$PM/.env" ]] || fail "стенд: .env — ссылка на .env dev"
dev_down
run "$PM" dev-check fresh
expect 1 "стенд: цель dev"
has err "Это не копия для dev" "стенд: почему"
rm -f "$TMP/docker.log"
run "$PM" dev-take
expect 1 "стенд: dev-take"
total=$((total + 1)); [[ ! -f "$TMP/docker.log" ]] || fail "dev-take со стенда тронул dev"

# --- Makefile: каждая цель, которая работает с dev, — с замком первой строкой ---------------------------------------
# Работа с dev: exec в контейнер ($(PHP), $(ARTISAN), $(DC) exec), up / down / build / stop / restart проекта dev,
# скрипты бэкапа и ролей базы. dev-take забирает dev через make up — у up замок свой
missing="$(awk '
  /^[a-zA-Z_-]+:/ { target = $1; sub(/:.*/, "", target); first = ""; next }
  /^\t/ && target != "" {
    if (first == "") first = $0
    if ($0 ~ /\$\((PHP|ARTISAN)\)|\$\(DC\) (exec|up|down|build|stop|restart)|scripts\/(backup|restore|backup-verify|db-roles)\.sh/ \
        && first !~ /^\t\$\(DEV_LOCK\) \$@$/ && target != "dev-take") { print target; target = "" }
    next }
  { target = "" }' "$ROOT/Makefile" | sort -u)"
total=$((total + 1))
[[ -z "$missing" ]] || fail "цели Makefile работают с dev без замка (\$(DEV_LOCK) \$@ первой строкой): $(echo $missing)"

if [[ "$failed" -eq 0 ]]; then
  echo "Параллельные сессии: все проверки (${total}) — как ожидалось."
else
  echo "Параллельные сессии: провалено ${failed} из ${total}" >&2
  exit 1
fi
