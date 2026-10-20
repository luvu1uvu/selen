#!/usr/bin/env bash
# Тест очистки рабочих копий сессий (make host-worktrees-clean, scripts/host.sh; LATER-69): make lint и CI.
# Во временном каталоге — «GitHub» (голый репозиторий) и основная копия с рабочими копиями: копии сессий Remote Control
# (bridge-cse_…) и копии других сессий. Функции host.sh подключаются через source; ответ «y» — подмена confirm_removal,
# и до ответа тест меняет копии, как PM во втором окне Терминала. Процессы в копиях — настоящий lsof; docker не нужен:
# список docker-стеков — подмена compose_files. Реальные копии и настройки git пользователя не затрагиваются.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

command -v lsof > /dev/null || { echo "Тест очистки копий: нужен lsof" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'stop_busy; rm -rf "$TMP"' EXIT
# Настоящий путь (macOS: /var → /private/var): git и lsof показывают его
TMP="$(cd "$TMP" && pwd -P)"
export GIT_CONFIG_GLOBAL="$TMP/gitconfig" GIT_CONFIG_NOSYSTEM=1
git config --global user.name "Тест"
git config --global user.email test@example.com
git config --global init.defaultBranch main

export SELEN_MAIN_DIR="$TMP/none"
# shellcheck source=host.sh
source "$ROOT/scripts/host.sh"

stop_busy() { [[ ! -f "$TMP/busy.pids" ]] || { kill $(cat "$TMP/busy.pids") 2> /dev/null || true; rm -f "$TMP/busy.pids"; }; }
failed=0
total=0
fail() { failed=$((failed + 1)); echo "ПРОВАЛ: $*"; }

# Новая основная копия с «GitHub»: MAIN_DIR и WORKTREES_DIR скрипта — в ней
new_repo() {
  MAIN="$TMP/$1/main"
  git init -q --bare "$TMP/$1/origin.git"
  git init -q "$MAIN"
  printf '%s\n' '.env' '/backups/' 'node_modules/' '.DS_Store' '/.claude/worktrees/' > "$MAIN/.gitignore"
  mkdir -p "$MAIN/frontend" && echo '{}' > "$MAIN/frontend/package.json"
  git -C "$MAIN" add .gitignore frontend
  git -C "$MAIN" commit -qm init
  git -C "$MAIN" remote add origin "$TMP/$1/origin.git"
  git -C "$MAIN" push -q origin HEAD:main
  MAIN_DIR="$MAIN"
  WORKTREES_DIR="$MAIN/.claude/worktrees"
}

# new_copy <имя> [ветка] — рабочая копия от origin/main (ветка как у Remote Control — worktree-<имя>)
new_copy() { git -C "$MAIN" worktree add -b "${2:-worktree-$1}" "$WORKTREES_DIR/$1" origin/main > /dev/null 2>&1; }
lock() { git -C "$MAIN" worktree lock --reason "$2" "$WORKTREES_DIR/$1"; }
lock_of() { git -C "$MAIN" worktree list --porcelain | awk -v p="$WORKTREES_DIR/$1" '/^worktree / { w = substr($0, 10) } w == p && /^locked/ { print substr($0, 8) }'; }
# Блокировка сервера Remote Control: жив — pid и время запуска этого теста, брошена — тот же pid, другое время запуска
started="$(LC_ALL=C ps -o lstart= -p $$ | tr -s ' ' | sed 's/^ //; s/ $//')"
live_lock() { echo "claude agent $1 (pid $$ start $started)"; }
dead_lock() { echo "claude agent $1 (pid $$ start Mon Jan 1 00:00:00 2001)"; }
# Процесс, работающий внутри копии (как процесс сессии); stop_busy — завершить все такие процессы
busy() { (cd "$WORKTREES_DIR/$1" && exec sleep 300) & echo "$!" >> "$TMP/busy.pids"; disown "$!"; sleep 1; }

compose_files() { printf '%s\n' "$WORKTREES_DIR/bridge-cse_docker/docker-compose.yml"; }
on_confirm() { :; }
# Очистка с ответом «y»: до ответа — on_confirm. Вывод — в $TMP/out. skip_recheck=1 — без перепроверки после ответа
run_clean() {
  (
    confirm_removal() { on_confirm || { echo "ТЕСТ: подготовка до ответа не удалась"; exit 3; }; echo "(тест: ответ y)"; }
    if [[ -n "${skip_recheck:-}" ]]; then worktree_recheck() { :; }; fi
    cmd_worktrees_clean
  ) > "$TMP/out" 2>&1 || true
}

# removed <имя> <что проверяем>
removed() {
  total=$((total + 1))
  [[ ! -e "$WORKTREES_DIR/$1" ]] || fail "$2: копия $1 не удалена"
}
# kept <имя> <фрагмент причины> <что проверяем> — копия на месте, в выводе — её строка с причиной
kept() {
  local lines
  total=$((total + 1))
  lines="$(grep -F -- "  $1" "$TMP/out" || true)"
  if [[ ! -d "$WORKTREES_DIR/$1" ]]; then fail "$3: копия $1 удалена"
  elif [[ "$lines" != *"$2"* ]]; then fail "$3: у $1 нет причины «$2»"; fi
}
show_out_on_failure() { [[ "$failed" -eq "$1" ]] || sed 's/^/    | /' "$TMP/out"; }

# --- 1. Какие копии удаляются: одна проверка, ответ «y» без изменений ------------------------------------------
before=$failed
new_repo s1
new_copy bridge-cse_clean
mkdir -p "$WORKTREES_DIR/bridge-cse_clean/frontend/node_modules/x"
touch "$WORKTREES_DIR/bridge-cse_clean/frontend/node_modules/x/index.js" "$WORKTREES_DIR/bridge-cse_clean/.DS_Store"
new_copy bridge-cse_dead && lock bridge-cse_dead "$(dead_lock bridge-cse_dead)"
new_copy bridge-cse_live && lock bridge-cse_live "$(live_lock bridge-cse_live)"
new_copy bridge-cse_other && lock bridge-cse_other "test"
new_copy funny-blackburn-abc123 claude/funny-blackburn-abc123
new_copy feature-x
new_copy bridge-cse_env && touch "$WORKTREES_DIR/bridge-cse_env/.env"
new_copy bridge-cse_dump && mkdir -p "$WORKTREES_DIR/bridge-cse_dump/backups"
touch "$WORKTREES_DIR/bridge-cse_dump/backups/selen-2026-10-19.dump"
new_copy bridge-cse_dirty && echo "*.tmp" >> "$WORKTREES_DIR/bridge-cse_dirty/.gitignore"
new_copy bridge-cse_unpushed && git -C "$WORKTREES_DIR/bridge-cse_unpushed" commit -q --allow-empty -m "не на GitHub"
new_copy bridge-cse_proc && busy bridge-cse_proc
new_copy bridge-cse_docker

total=$((total + 1))
summary="$(worktrees_summary)"
[[ "$summary" == "12, из них завершённых без изменений — 2: make host-worktrees-clean" ]] \
  || fail "make host-status: «${summary}»"

run_clean
removed bridge-cse_clean "чистая копия Remote Control (кеши не мешают)"
total=$((total + 1))
! git -C "$MAIN" show-ref -q --verify refs/heads/worktree-bridge-cse_clean || fail "ветка чистой копии не удалена"
removed bridge-cse_dead "брошенная блокировка Remote Control"
kept bridge-cse_live "заблокирована работающим сервером Remote Control" "живая блокировка"
kept bridge-cse_other "заблокирована не сервером Remote Control: test" "чужая блокировка"
kept funny-blackburn-abc123 "не Remote Control" "копия сессии приложения Claude"
kept feature-x "не Remote Control" "копия claude --worktree"
kept bridge-cse_env "есть файлы вне git (например, .env)" ".env в копии"
kept bridge-cse_dump "есть файлы вне git (например, backups/)" "дамп в копии"
kept bridge-cse_dirty "есть незакоммиченные изменения" "изменённый файл"
kept bridge-cse_unpushed "есть коммиты, которых нет на GitHub" "коммит не на GitHub"
kept bridge-cse_proc "сессия работает: внутри процесс" "процесс в копии"
kept bridge-cse_docker "docker-стек" "docker-стек из копии"
total=$((total + 1))
[[ "$(lock_of bridge-cse_live)" == "$(live_lock bridge-cse_live)" ]] || fail "живая блокировка снята"
stop_busy
show_out_on_failure "$before"

# --- 2. status.showUntrackedFiles=no: защита файлов вне git не зависит от настройки ---------------------------
before=$failed
new_repo s2
git -C "$MAIN" config status.showUntrackedFiles no
new_copy bridge-cse_env && touch "$WORKTREES_DIR/bridge-cse_env/.env"
new_copy bridge-cse_untracked && touch "$WORKTREES_DIR/bridge-cse_untracked/notes.txt"
new_copy bridge-cse_clean
run_clean
kept bridge-cse_env "есть файлы вне git (например, .env)" "showUntrackedFiles=no, .env"
kept bridge-cse_untracked "есть незакоммиченные изменения" "showUntrackedFiles=no, неотслеживаемый файл"
removed bridge-cse_clean "showUntrackedFiles=no, чистая копия"
show_out_on_failure "$before"

# Второй рубеж — сам git worktree remove: даже без перепроверки он не удаляет неотслеживаемый файл при «no»,
# а снятая блокировка возвращается
before=$failed
new_copy bridge-cse_late && lock bridge-cse_late "$(dead_lock bridge-cse_late)"
on_confirm() { touch "$WORKTREES_DIR/bridge-cse_late/notes.txt"; }
skip_recheck=1 run_clean
kept bridge-cse_late "git worktree remove отказался" "showUntrackedFiles=no, git worktree remove"
total=$((total + 1))
[[ "$(lock_of bridge-cse_late)" == "$(dead_lock bridge-cse_late)" ]] || fail "блокировка не возвращена после отказа git"
show_out_on_failure "$before"

# --- 3. Копия изменилась между вопросом и «y» (шаги карточки LATER-69) ----------------------------------------
before=$failed
new_repo s3
new_copy bridge-cse_card
new_copy bridge-cse_env
new_copy bridge-cse_live && lock bridge-cse_live "$(dead_lock bridge-cse_live)"
new_copy bridge-cse_proc
new_copy bridge-cse_commit
new_copy bridge-cse_ok
on_confirm() {
  touch "$WORKTREES_DIR/bridge-cse_card/.env" && lock bridge-cse_card "test" \
    && touch "$WORKTREES_DIR/bridge-cse_env/.env" \
    && git -C "$MAIN" worktree unlock "$WORKTREES_DIR/bridge-cse_live" \
    && lock bridge-cse_live "$(live_lock bridge-cse_live)" \
    && busy bridge-cse_proc \
    && git -C "$WORKTREES_DIR/bridge-cse_commit" commit -q --allow-empty -m "после вопроса" \
    && git -C "$WORKTREES_DIR/bridge-cse_commit" push -q origin HEAD:refs/heads/worktree-bridge-cse_commit
}
run_clean
total=$((total + 1))
grep -qF "(тест: ответ y)" "$TMP/out" || fail "до вопроса копии не дошли"
kept bridge-cse_card "НЕ удалена — заблокирована не сервером Remote Control: test" "карточка: .env и блокировка после вопроса"
total=$((total + 1))
[[ "$(lock_of bridge-cse_card)" == "test" ]] || fail "блокировка, поставленная после вопроса, снята"
kept bridge-cse_env "НЕ удалена — есть файлы вне git (например, .env)" ".env после вопроса"
kept bridge-cse_live "НЕ удалена — заблокирована работающим сервером Remote Control" "живая блокировка после вопроса"
total=$((total + 1))
[[ "$(lock_of bridge-cse_live)" == "$(live_lock bridge-cse_live)" ]] || fail "живая блокировка, поставленная после вопроса, снята"
kept bridge-cse_proc "НЕ удалена — сессия работает" "процесс после вопроса"
kept bridge-cse_commit "НЕ удалена — после вопроса в копии новый коммит" "коммит после вопроса"
removed bridge-cse_ok "копия без изменений после вопроса"
stop_busy
on_confirm() { :; }
show_out_on_failure "$before"

# --- 4. docker не ответил — ничего не удаляется ----------------------------------------------------------------
before=$failed
new_repo s4
new_copy bridge-cse_clean
compose_files() { return 1; }
run_clean
total=$((total + 1))
[[ -d "$WORKTREES_DIR/bridge-cse_clean" ]] || fail "docker не ответил: копия удалена"
total=$((total + 1))
grep -qF "docker не ответил" "$TMP/out" || fail "docker не ответил: нет сообщения"
show_out_on_failure "$before"

# --- 5. Подтверждение не из терминала (echo y | make …) — ничего не удаляется ------------------------------------
before=$failed
mkdir -p "$TMP/bin"
printf '#!/bin/sh\necho "[]"\n' > "$TMP/bin/docker"
chmod +x "$TMP/bin/docker"
total=$((total + 1))
PATH="$TMP/bin:$PATH" SELEN_MAIN_DIR="$MAIN" "$ROOT/scripts/host.sh" worktrees-clean <<< "y" > "$TMP/out" 2>&1 || true
[[ -d "$WORKTREES_DIR/bridge-cse_clean" ]] || fail "ответ y не из терминала удалил копию"
grep -qF "только с подтверждением в окне Терминала" "$TMP/out" || fail "ответ не из терминала: нет сообщения"
show_out_on_failure "$before"

if [[ "$failed" -gt 0 ]]; then
  echo "Очистка рабочих копий: провалено ${failed} из ${total} проверок." >&2
  exit 1
fi
echo "Очистка рабочих копий: все проверки (${total}) — как ожидалось."
