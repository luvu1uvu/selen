#!/usr/bin/env bash
# Тест hook агента security-auditor (.claude/hooks/security-auditor-guard.sh, ADR-0020): make lint и CI.
# Во временном каталоге собирается макет — основная копия с .env и рабочей копией, стенд с кешем конфигурации,
# домашний каталог с ~/.config/selen — и hook получает запросы инструментов, как от Claude Code. Ожидаемо: 0 —
# разрешено, 2 — запрещено. Команды из запросов не выполняются. Кейсы «2» — найденные ревью и аудитом обходы.
set -euo pipefail
cd "$(dirname "$0")/.."
HOOK="$PWD/.claude/hooks/security-auditor-guard.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
MAIN="$TMP/main"
PM="$TMP/pm"
HOME_DIR="$TMP/home"
WT="$MAIN/.claude/worktrees/wt"
mkdir -p "$MAIN/backend/app" "$MAIN/backend/bootstrap/cache" "$MAIN/backups" "$MAIN/docs" "$WT" \
  "$PM/backend/bootstrap/cache" "$HOME_DIR/.config/selen" "$HOME_DIR/.ssh"
touch "$MAIN/.env" "$MAIN/.env.example" "$MAIN/backend/app/Code.php" "$MAIN/backend/bootstrap/cache/config.php" \
  "$WT/.env" "$PM/.env" "$PM/backend/bootstrap/cache/config.php" \
  "$HOME_DIR/.config/selen/offsite.env" "$HOME_DIR/.config/selen/restic-password" "$HOME_DIR/.ssh/id_ed25519"
ln -s ../.env "$MAIN/docs/link-to-env"

failed=0
total=0

# check <ожидаемый код> <описание> <JSON запроса>
check() {
  local expected="$1" title="$2" json="$3" code=0
  total=$((total + 1))
  HOME="$HOME_DIR" SELEN_MAIN_DIR="$MAIN" SELEN_PM_DIR="$PM" "$HOOK" <<< "$json" > /dev/null 2>&1 || code=$?
  if [[ "$code" != "$expected" ]]; then
    failed=$((failed + 1))
    echo "ПРОВАЛ: ${title} — ожидался код ${expected}, получен ${code}"
  fi
}

# bash <ожидаемый код> <команда> [рабочий каталог]
bash_case() {
  local cwd="${3:-$MAIN}"
  check "$1" "Bash: $2 (cwd ${cwd#"$TMP"/})" \
    "$(jq -nc --arg c "$2" --arg d "$cwd" '{tool_name: "Bash", cwd: $d, tool_input: {command: $c}}')"
}
read_case() {
  check "$1" "Read: $2" "$(jq -nc --arg p "$2" --arg d "$MAIN" '{tool_name: "Read", cwd: $d, tool_input: {file_path: $p}}')"
}
grep_case() {
  check "$1" "Grep: $2 ${3:-}" "$(jq -nc --arg p "$2" --arg m "${3:-}" --arg d "$MAIN" \
    '{tool_name: "Grep", cwd: $d, tool_input: ({path: $p, pattern: "x"} + (if $m == "" then {} else {output_mode: $m} end))}')"
}

# --- Разрешено
bash_case 0 'git log --oneline -5'
bash_case 0 'git log -p -Spassword --all'
bash_case 0 'git log --all --diff-filter=A --name-only'
bash_case 0 'git grep -n -e APP_KEY'
bash_case 0 'git grep -nE password'
bash_case 0 'git diff --stat main...HEAD'
bash_case 0 'git show HEAD:backend/routes/api.php'
bash_case 0 'git blame -L 1,5 Makefile'
bash_case 0 'git branch --show-current'
bash_case 0 'git worktree list'
bash_case 0 'ls -la ~/.config/selen'
bash_case 0 'stat -f %Sp:%Su:%N .env'
bash_case 0 'make audit-deps' "$WT"
bash_case 0 'make test'
read_case 0 "$MAIN/backend/app/Code.php"
read_case 0 "$MAIN/.env.example"
grep_case 0 "$MAIN/backend/app" content
grep_case 0 "$MAIN" files_with_matches
grep_case 0 "$MAIN"
grep_case 0 "$PM/.env" count

# --- Запрещено: проверка hook, каталог, белый список
bash_case 2 'echo security-auditor-hook-check'
bash_case 2 'git log' "$PM"
bash_case 2 'git log' "$MAIN/.claude/worktrees/../../../pm"
bash_case 2 'make test' "$WT"
bash_case 2 'make host-status'
bash_case 2 'make test FOO=1'
bash_case 2 'cat .env'
bash_case 2 'GIT log'
bash_case 2 'git -c core.pager=sh log'
bash_case 2 'git branch --show-current -D main'
bash_case 2 'ls; rm x'
bash_case 2 'ls $(id)'
bash_case 2 'wc --files0-from=.env'
# --- Запрещено: обходы белого списка git (ревью и аудит LATER-60)
bash_case 2 'git grep "-Orm" TODO'
bash_case 2 'git grep -nOrm TODO'
bash_case 2 'git grep --open-files-in-pa{g,g}er=rm TODO'
bash_case 2 'git grep --open=cat x'
bash_case 2 'git grep -nf .env'
bash_case 2 'git diff "--output=/tmp/x"'
bash_case 2 "git log --o''utput=/tmp/x"
bash_case 2 'git diff -{-output=/tmp/x,-stat}'
bash_case 2 'git log --out=x'
bash_case 2 'git diff --no-i a b'
bash_case 2 "git diff /dev/null ${MAIN}/.env"
bash_case 2 'git diff ../../../.env /dev/null' "$WT"
bash_case 2 'git diff ~/.config/selen/offsite.env x'
bash_case 2 'git blame -S .env Makefile'
bash_case 2 'git blame -wS .env Makefile'
bash_case 2 'git blame --ignore-revs-file=.env Makefile'
bash_case 2 'git blame --cont=.env Makefile'
bash_case 2 'git cat-file --filters HEAD:x'
# --- Запрещено: секреты и пути вне копий
read_case 2 "$MAIN/.env"
read_case 2 "$MAIN/docs/link-to-env"
read_case 2 "$MAIN/docs/../.env"
read_case 2 "$WT/.env"
read_case 2 "$MAIN/backend/bootstrap/cache/config.php"
read_case 2 "$PM/backend/bootstrap/cache/config.php"
read_case 2 "$HOME_DIR/.config/selen/offsite.env"
read_case 2 "$HOME_DIR/.config/./selen/restic-password"
read_case 2 "$HOME_DIR/.ssh/id_ed25519"
read_case 2 "$MAIN/.ENV"
read_case 2 "$PM/.Env"
read_case 2 "$HOME_DIR/.config/SELEN/RESTIC-PASSWORD"
grep_case 2 "$HOME_DIR/.config" content
grep_case 2 "$HOME_DIR/.config" files_with_matches
grep_case 2 "$TMP" files_with_matches
grep_case 2 "$MAIN" content
grep_case 2 "$WT" content
grep_case 2 "$MAIN/backend" content
grep_case 2 "$PM/backend/bootstrap" content
grep_case 2 "$PM/.env" content
check 2 'не JSON' 'not json'

if [[ "$failed" -gt 0 ]]; then
  echo "Hook аудитора: провалено ${failed} из ${total} кейсов." >&2
  exit 1
fi
echo "Hook аудитора: все кейсы (${total}) — как ожидалось."
