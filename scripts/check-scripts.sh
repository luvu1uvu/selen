#!/usr/bin/env bash
# Проверка shell-скриптов (make lint, CI). bash 3.2 на macOS под UTF-8-локалью считает байты не-ASCII символа
# частью имени переменной: «$VAR» читается как переменная «VAR\xc2» → «unbound variable». Пишите ${VAR}».
set -euo pipefail
cd "$(dirname "$0")/.."

perl -ne 'if (!/^\s*#/ && /\$[A-Za-z_][A-Za-z0-9_]*(?=[^\x00-\x7F])/) { print "$ARGV:$.: $_"; $bad = 1 }
  close ARGV if eof; END { exit($bad ? 1 : 0) }' scripts/*.sh .claude/hooks/*.sh \
  || { echo 'Переменная вплотную перед не-ASCII символом — оберните её в фигурные скобки: ${VAR}»' >&2; exit 1; }

# Hook агента security-auditor: белый список команд и защита секретов (ADR-0020)
./scripts/test-auditor-hook.sh

# Очистка рабочих копий сессий (make host-worktrees-clean): перепроверка после «y», только копии Remote Control (LATER-69)
./scripts/test-host-worktrees.sh
