#!/usr/bin/env bash
# Hook PreToolUse агента security-auditor (.claude/agents/security-auditor.md, ADR-0020): агент только читает.
#   Bash — одна простая команда из белого списка, только из основной копии (~/dev/selen) или рабочих копий сессий
#          (~/dev/selen/.claude/worktrees/…); символы — только [A-Za-z0-9 ._/:@^~=,%+-] (без кавычек, скобок,
#          шаблонов, подстановок, цепочек и перенаправлений).
#   Read — только в копиях Selen, стенде, агентах launchd и логах Selen; секреты (.env, offsite.env, пароль restic,
#          дампы и бэкапы, кеш конфигурации Laravel, файлы вложений) — нет.
#   Grep — там же; по секретам и каталогам, где они лежат, — только счётчик или список файлов, без строк.
# Пути сравниваются после приведения к реальному (perl Cwd::abs_path: .., симлинки) и без учёта регистра (APFS).
# Это защита от случайного вывода секретов и случайных изменений, а не от злонамеренного агента: по счётчику Grep
# значение можно подобрать.
# Запрет — код выхода 2, причина — в stderr (её видит агент). Любой другой сбой hook — тоже запрет (trap).
# Нужны jq и perl (есть в macOS). Hook агента работает, только если Claude Code доверяет папке проекта; проверка —
# команда «echo security-auditor-hook-check» (hook всегда её запрещает, агент делает её первой).
set -uo pipefail
shopt -s nocasematch
trap 'rc=$?; if [[ $rc -ne 0 && $rc -ne 2 ]]; then echo "security-auditor: сбой hook (код ${rc}) — команда не выполнена." >&2; exit 2; fi' EXIT

deny() {
  printf 'security-auditor: %s\n' "$1" >&2
  exit 2
}

# Реальный абсолютный путь существующего файла или каталога; иначе пусто
real_path() { perl -MCwd=abs_path -e '$p = abs_path($ARGV[0]); print $p if defined $p' -- "$1" 2> /dev/null; }

MAIN_DIR="$(real_path "${SELEN_MAIN_DIR:-$HOME/dev/selen}")"
PM_DIR="$(real_path "${SELEN_PM_DIR:-$HOME/dev/selen-pm}")"
REAL_HOME="$(real_path "$HOME")"
[[ -n "$MAIN_DIR" && -n "$REAL_HOME" ]] || deny "нет основной копии ~/dev/selen — аудитор работает только из неё и её рабочих копий."

input="$(cat)"
field() { jq -r "$1 // empty" <<< "$input" 2> /dev/null; }
tool="$(field .tool_name)"
[[ -n "$tool" ]] || deny "hook не разобрал запрос — команда не выполнена."
cwd="$(real_path "$(field .cwd)")"

# Путь из запроса инструмента → реальный (относительный — от рабочего каталога)
tool_path() {
  local p="$1"
  [[ -n "$p" ]] || p="$cwd"
  [[ "$p" == "~"* ]] && p="${HOME}${p#\~}"
  [[ "$p" == /* ]] || p="${cwd}/${p}"
  real_path "$p"
}

# Корни, в которых агенту можно читать: копии Selen, стенд, агенты launchd и логи Selen, сохранённый вывод инструментов
readable() {
  case "$1" in
    "$MAIN_DIR" | "$MAIN_DIR"/*) return 0 ;;
    "$REAL_HOME"/Library/LaunchAgents/local.selen.* | "$REAL_HOME"/Library/Logs/Selen | "$REAL_HOME"/Library/Logs/Selen/*) return 0 ;;
    "$REAL_HOME"/.claude/projects/*/tool-results/*) return 0 ;;
  esac
  [[ -n "$PM_DIR" ]] && case "$1" in "$PM_DIR" | "$PM_DIR"/*) return 0 ;; esac
  return 1
}

# Файл с секретами или данными пользователей
is_secret() {
  local name="${1##*/}"
  case "$name" in
    *.example) ;;
    .env | .env.* | offsite.env | restic-password | *.dump) return 0 ;;
  esac
  case "$1" in
    */backups | */backups/* | *selen-pm-backups* | */bootstrap/cache/* | */storage/app/* | */.config/selen*) return 0 ;;
  esac
  return 1
}

# Каталог, поиск по которому со строками может задеть секреты: корень копии, backend, backend/bootstrap
# (внутри — .env, кеш конфигурации Laravel), .claude (рабочие копии), бэкапы и файлы вложений
holds_secrets() {
  local dir="$1" root
  for root in "$MAIN_DIR" "$PM_DIR" "$MAIN_DIR"/.claude/worktrees/*; do
    [[ -n "$root" ]] || continue
    case "$dir" in
      "$root" | "$root"/backend | "$root"/backend/bootstrap | "$root"/.claude | "$root"/.claude/worktrees) return 0 ;;
    esac
  done
  is_secret "$dir/x"
}

case "$tool" in
  Read)
    path="$(tool_path "$(field .tool_input.file_path)")"
    [[ -n "$path" ]] || deny "нет такого файла или путь не разобран."
    readable "$path" || deny "${path} — вне копий Selen, стенда и логов Selen; аудитору читать нельзя."
    is_secret "$path" && deny "${path} — секреты или данные пользователей, читать нельзя. Права — ls -l или stat, наличие ключа — Grep с output_mode count."
    exit 0
    ;;
  Grep)
    path="$(tool_path "$(field .tool_input.path)")"
    glob="$(field .tool_input.glob)"
    mode="$(field .tool_input.output_mode)"
    [[ -n "$path" ]] || deny "нет такого пути или путь не разобран."
    readable "$path" || deny "${path} — вне копий Selen, стенда и логов Selen; аудитору искать там нельзя."
    # Без output_mode Grep отдаёт список файлов (files_with_matches)
    if [[ -z "$mode" || "$mode" == "count" || "$mode" == "files_with_matches" ]]; then exit 0; fi
    if is_secret "$path" || { [[ -d "$path" ]] && holds_secrets "$path"; } || [[ "$glob" == *env* || "$glob" == *dump* ]]; then
      deny "${path}: здесь лежат секреты — поиск только с output_mode count или files_with_matches, или сузьте path до каталога кода (backend/app, frontend/src, docker, scripts…)."
    fi
    exit 0
    ;;
  Bash) ;;
  *) exit 0 ;;
esac

cmd="$(field .tool_input.command)"
# Команды и параметры git различают регистр: дальше сравнения — с учётом регистра (GIT log не пройдёт)
shopt -u nocasematch

[[ "$cmd" == "echo security-auditor-hook-check" ]] \
  && deny "hook-check: hook агента активен, команды Bash проверяются белым списком."

case "$cwd" in
  "$MAIN_DIR" | "$MAIN_DIR"/.claude/worktrees/*) ;;
  *) deny "рабочий каталог ${cwd:-?} — не ${MAIN_DIR} и не его рабочая копия (.claude/worktrees). Аудитор здесь команды не выполняет." ;;
esac

safe_re='^[A-Za-z0-9 ._/:@^~=,%+-]+$'
[[ "$cmd" =~ $safe_re ]] \
  || deny "только одна простая команда из букв, цифр и символов ._/:@^~=,%+- (без кавычек, скобок, шаблонов, цепочек): ${cmd}"

set -f
# shellcheck disable=SC2206 # слова команды — по пробелам, шаблонов в ней нет (проверено выше)
words=($cmd)
sub="${words[1]:-}"

case "${words[0]}" in
  git)
    case "$cmd" in
      "git branch --show-current" | "git worktree list" | "git worktree list --porcelain") exit 0 ;;
    esac
    case "$sub" in
      log | show | grep | ls-files | ls-tree | diff | status | rev-parse | rev-list | blame | shortlog | cat-file) ;;
      *) deny "git ${sub} нет в белом списке аудитора: ${cmd}" ;;
    esac
    for word in "${words[@]:2}"; do
      # Пути вне рабочей копии: git diff с таким путём сравнивает файлы на диске (неявный --no-index)
      case "$word" in
        /* | "~"* | .. | ../* | */../* | */..) deny "пути вне рабочей копии git аудитору запрещены: ${word}" ;;
      esac
      case "$word" in
        --*)
          # git принимает начало длинного параметра (--no-i = --no-index): запрещено любое начало от трёх символов
          name="${word%%=*}"
          for bad in --output --open-files-in-pager --no-index --untracked --contents --file --ext-diff --textconv \
            --ignore-revs-file --filters; do
            [[ ${#name} -ge 3 && "$bad" == "$name"* ]] && deny "параметр git ${name} не разрешён аудитору: ${cmd}"
          done
          ;;
        -*)
          # Короткие параметры склеиваются (-nO<программа>). Аргумент начинается после первой буквы, которая его
          # принимает (-S, -G, -L, -e): -Spassword — не параметр O
          [[ "$word" =~ ^-[^SGLe]*O ]] && deny "параметр git -O не разрешён аудитору (у grep запускает программу): ${cmd}"
          [[ "$sub" == grep && "$word" =~ ^-[^e]*f ]] && deny "git grep -f (шаблоны из файла) не разрешён аудитору: ${cmd}"
          [[ "$sub" == blame && "$word" =~ ^-[^L]*S ]] && deny "git blame -S (файл ревизий) не разрешён аудитору: ${cmd}"
          ;;
      esac
    done
    exit 0
    ;;
  pwd | ls | stat | wc)
    # Права и размеры файлов. GNU wc --files0-from печатает содержимое файла в ошибке
    [[ "$cmd" == *--files0* ]] && deny "--files0-from не разрешён аудитору: ${cmd}"
    exit 0
    ;;
  make)
    [[ ${#words[@]} -eq 2 ]] || deny "make — только одна цель без переменных: ${cmd}"
    case "$sub" in
      audit-deps) exit 0 ;;
      host-status)
        # Без стенда цель создала бы его рабочую копию (pm-worktree) — это запись
        [[ -n "$PM_DIR" && -x "$PM_DIR/scripts/host.sh" ]] || deny "make host-status — только на хосте стенда (нет ${PM_DIR:-~/dev/selen-pm})."
        exit 0
        ;;
      test | test-backend | test-frontend | lint)
        # Проверки идут в стеке своей копии, а не в dev (LATER-92) — из основной копии или рабочей копии сессии
        case "$cwd" in
          "$MAIN_DIR" | "$MAIN_DIR"/.claude/worktrees/?*) exit 0 ;;
        esac
        deny "make ${sub} — только из ${MAIN_DIR} или её рабочих копий (.claude/worktrees/…)."
        ;;
    esac
    ;;
esac

deny "команды нет в белом списке аудитора (.claude/hooks/security-auditor-guard.sh): ${cmd}"
