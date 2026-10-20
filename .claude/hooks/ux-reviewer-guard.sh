#!/usr/bin/env bash
# Hook агента ux-reviewer (.claude/agents/ux-reviewer.md, ADR-0023): агент только смотрит.
#   Встроенный браузер (mcp__Claude_Browser__*) — только своя вкладка и только dev:
#     tabs_create — только в фоне; номер новой вкладки (tab-N) из ответа hook запоминает (PostToolUse), tabs_close —
#     забывает. Другой номер (seed — общая вкладка панели: так отвечает tabs_create, если панель закрыли) не запоминается;
#     остальные действия — только с tabId из этого списка: вкладки PM и других сессий (в том числе со стендом) агент
#     не трогает и на передний план не выводит;
#     navigate — только страницы http://localhost:8080 (не 127.0.0.1: cookie не различают порт и были бы общими со
#     стендом 127.0.0.1:8081), без «Назад/Вперёд» и адресов API;
#     computer — без перетаскивания мышью (left_click_drag отпускает карточку — это перенос);
#     javascript_tool — только чтение страницы: без сети, переходов, cookie, хранилищ и программных щелчков;
#     browser_batch — те же правила для каждого шага, без tabs_create, tabs_close и вложенных пакетов.
#   Read и Grep — только в копиях Selen и в сохранённом выводе инструментов; секреты (.env, бэкапы, кеш конфигурации
#     Laravel, файлы вложений) — нет; Grep со строками по каталогам, где они лежат, — только счётчик или список файлов.
# Это защита от случайного (ошибка агента, инструкция из прочитанного текста), а не от злонамеренного агента:
# запрещённое слово в JS можно собрать из частей.
# Запрет — код выхода 2, причина — в stderr (её видит агент). Любой другой сбой hook — тоже запрет (trap).
# Нужны jq и perl (есть в macOS). Hook агента работает, только если Claude Code доверяет папке проекта; проверка —
# tabs_close с tabId «ux-reviewer-hook-check» (hook всегда запрещает; без hook — безвредная ошибка «нет вкладки»).
set -uo pipefail
trap 'rc=$?; if [[ $rc -ne 0 && $rc -ne 2 ]]; then echo "ux-reviewer: сбой hook (код ${rc}) — действие не выполнено." >&2; exit 2; fi' EXIT

deny() {
  printf 'ux-reviewer: %s\n' "$1" >&2
  exit 2
}

# Реальный абсолютный путь существующего файла или каталога; иначе пусто
real_path() { perl -MCwd=abs_path -e '$p = abs_path($ARGV[0]); print $p if defined $p' -- "$1" 2> /dev/null; }

MAIN_DIR="$(real_path "${SELEN_MAIN_DIR:-$HOME/dev/selen}")"
REAL_HOME="$(real_path "$HOME")"
[[ -n "$MAIN_DIR" && -n "$REAL_HOME" ]] || deny "нет основной копии ~/dev/selen — ревьюер работает только из неё и её рабочих копий."

input="$(cat)"
field() { jq -r "$1 // empty" <<< "$input" 2> /dev/null; }
tool="$(field .tool_name)"
[[ -n "$tool" ]] || deny "hook не разобрал запрос — действие не выполнено."
event="$(field .hook_event_name)"
cwd="$(real_path "$(field .cwd)")"

# --- Вкладки агента: файл со списком номеров, по одному на строку; ключ — агент (или сессия)
TABS_DIR="${SELEN_UX_TABS_DIR:-${TMPDIR:-/tmp}/selen-ux-reviewer}"
key="$(field .agent_id)"
[[ -n "$key" ]] || key="$(field .session_id)"
[[ "$key" =~ ^[A-Za-z0-9_-]+$ ]] || deny "в запросе нет номера агента или сессии — свою вкладку не определить."
TABS_FILE="${TABS_DIR}/${key}"

own_tab() { [[ -f "$TABS_FILE" ]] && grep -qxF -- "$1" "$TABS_FILE"; }

PREFIX='mcp__Claude_Browser__'

# После выполнения: запомнить созданную вкладку, забыть закрытую
if [[ "$event" == "PostToolUse" ]]; then
  case "$tool" in
    "${PREFIX}tabs_create")
      # Ответ: {"tabId": "tab-1", …} (текстом внутри ответа MCP — с экранированными кавычками). Своя — только новая
      # вкладка tab-N: на закрытой панели tabs_create открывает её заново и отвечает общей вкладкой seed
      tab="$(jq -c '.tool_response' <<< "$input" 2> /dev/null \
        | perl -ne 'if (/tabId\\*"\s*:\s*\\*"([A-Za-z0-9_-]+)/) { print $1; exit }')"
      if [[ "$tab" =~ ^tab-[0-9]+$ ]]; then
        mkdir -p "$TABS_DIR" && chmod 700 "$TABS_DIR" && printf '%s\n' "$tab" >> "$TABS_FILE"
      fi
      ;;
    "${PREFIX}tabs_close")
      tab="$(field .tool_input.tabId)"
      if [[ -n "$tab" && -f "$TABS_FILE" ]]; then
        grep -vxF -- "$tab" "$TABS_FILE" > "${TABS_FILE}.tmp"
        mv "${TABS_FILE}.tmp" "$TABS_FILE"
      fi
      ;;
  esac
  exit 0
fi

# --- Браузер: одно действие (name — без префикса, data — его input)
check_url() {
  local url="$1" path
  [[ "$url" =~ ^http://localhost:8080([/?#][^[:space:]]*)?$ ]] \
    || deny "адрес вне dev: ${url}. Можно только страницы http://localhost:8080 (не стенд, не 127.0.0.1, не внешние сайты, без «Назад/Вперёд»)."
  # Путь без строки запроса: браузер и nginx приводят «\», «%xx», «.» и «..» к другому пути (/./api → /api)
  path="${url#http://localhost:8080}"
  path="${path%%[?#]*}"
  case "$path" in
    *\\* | *%* | */./* | */../* | */. | */..) deny "в пути адреса — «\\», «%» или «.»/«..»; путь — как его показывает приложение: ${url}" ;;
  esac
  [[ "$(tr '[:upper:]' '[:lower:]' <<< "$path")" =~ ^/+(api|sanctum)(/|$) ]] && deny "адреса API агенту не нужны — только страницы приложения: ${url}"
  return 0
}

check_js() {
  local js="$1" bad
  # Сеть, переходы (и Navigation API), cookie и хранилища, выполнение строк как кода, программные щелчки и отправка
  # форм. Сбой perl — запрет
  bad="$(perl -0777 -ne 'if (/(\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\blocation\b|\bhistory\b|\bnavigation\s*\.|\bopen\s*\(|\.submit\s*\(|requestSubmit|\bcookie|localStorage|sessionStorage|indexedDB|\bcaches\b|serviceWorker|postMessage|\bimport\s*\(|\beval\b|\bFunction\s*\(|\.click\b|\[\s*["\x27`]click["\x27`]\s*\]|dispatchEvent|document\.write)/) { print $1 }' <<< "$js")" \
    || deny "сбой проверки JS — действие не выполнено."
  [[ -z "$bad" ]] || deny "JS — только чтение страницы (размеры, стили, текст); «${bad}» не разрешено. Щелчки и клавиши — computer, адрес — navigate."
  return 0
}

browser_action() {
  local name="$1" data="$2" in_batch="$3" tab
  case "$name" in
    tabs_context) return 0 ;;
    tabs_create)
      [[ "$in_batch" == 0 ]] || deny "tabs_create — отдельным вызовом, не в пакете: hook запоминает номер вкладки из ответа."
      [[ "$(jq -r '.foreground // false' <<< "$data")" == "false" ]] \
        || deny "вкладка — только в фоне (без foreground): передняя вкладка — у PM или другой сессии."
      return 0
      ;;
    browser_batch)
      [[ "$in_batch" == 0 ]] || deny "пакет внутри пакета не разрешён."
      local count i
      count="$(jq -r '.actions | if type == "array" then length else -1 end' <<< "$data" 2> /dev/null)"
      [[ "$count" =~ ^[0-9]+$ ]] || deny "пакет не разобран — действия не выполнены."
      for ((i = 0; i < count; i++)); do
        browser_action "$(jq -r ".actions[$i].name // empty" <<< "$data")" \
          "$(jq -c ".actions[$i].input // {}" <<< "$data")" 1
      done
      return 0
      ;;
    tabs_close)
      # Закрытие — отдельным вызовом: PostToolUse видит только его и вычёркивает номер
      [[ "$in_batch" == 0 ]] || deny "tabs_close — отдельным вызовом, не в пакете: hook вычёркивает номер вкладки после закрытия."
      ;;
    navigate | computer | find | get_page_text | read_page | javascript_tool | resize_window | read_console_messages) ;;
    *) deny "инструмент браузера «${name}» агенту не разрешён." ;;
  esac
  # Номер вкладки — строка из букв, цифр, «-» и «_»: иначе приложение взяло бы активную вкладку, а перевод строки
  # дал бы grep два образца
  tab="$(jq -r '.tabId | if type == "string" then . else empty end' <<< "$data" 2> /dev/null)"
  [[ "$name" == tabs_close && "$tab" == ux-reviewer-hook-check ]] \
    && deny "hook-check: hook агента активен — браузер только в своей вкладке и только dev."
  [[ "$tab" =~ ^[A-Za-z0-9_-]+$ ]] || deny "${name}: нужен tabId своей вкладки (строкой) — без него действие ушло бы в переднюю вкладку (PM или другой сессии)."
  [[ "$(jq -r 'has("serverId")' <<< "$data" 2> /dev/null)" == "false" ]] || deny "${name}: serverId агенту не нужен — только tabId своей вкладки."
  own_tab "$tab" || deny "${name}: вкладка ${tab} создана не агентом (или уже закрыта) — чужие вкладки не трогаем. Своя — tabs_create."
  case "$name" in
    navigate) check_url "$(jq -r '.url // empty' <<< "$data")" ;;
    computer)
      [[ "$(jq -r '.action // empty' <<< "$data")" != left_click_drag ]] \
        || deny "перетаскивание мышью отпускает карточку — это перенос, данные меняются. Место броска — переносом с клавиатуры с Esc."
      ;;
    javascript_tool) check_js "$(jq -r '.text // empty' <<< "$data")" ;;
  esac
  return 0
}

if [[ "$tool" == "$PREFIX"* ]]; then
  browser_action "${tool#"$PREFIX"}" "$(jq -c '.tool_input // {}' <<< "$input")" 0
  exit 0
fi

# --- Чтение кода
shopt -s nocasematch

# Путь из запроса инструмента → реальный (относительный — от рабочего каталога)
tool_path() {
  local p="$1"
  [[ -n "$p" ]] || p="$cwd"
  [[ "$p" == "~"* ]] && p="${HOME}${p#\~}"
  [[ "$p" == /* ]] || p="${cwd}/${p}"
  real_path "$p"
}

# Копии Selen (основная и рабочие копии внутри неё) и сохранённый вывод инструментов (скриншоты, длинный текст)
readable() {
  case "$1" in
    "$MAIN_DIR" | "$MAIN_DIR"/* | "$REAL_HOME"/.claude/projects/*/tool-results/*) return 0 ;;
  esac
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
    */backups | */backups/* | */bootstrap/cache/* | */storage/app/*) return 0 ;;
  esac
  return 1
}

# Каталог, поиск по которому со строками задел бы секреты: корень копии, backend, backend/bootstrap, .claude
holds_secrets() {
  local dir="$1" root
  for root in "$MAIN_DIR" "$MAIN_DIR"/.claude/worktrees/*; do
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
    readable "$path" || deny "${path} — вне копий Selen; ревьюеру читать нельзя."
    is_secret "$path" && deny "${path} — секреты или данные пользователей, читать нельзя."
    exit 0
    ;;
  Grep)
    path="$(tool_path "$(field .tool_input.path)")"
    glob="$(field .tool_input.glob)"
    mode="$(field .tool_input.output_mode)"
    [[ -n "$path" ]] || deny "нет такого пути или путь не разобран."
    readable "$path" || deny "${path} — вне копий Selen; ревьюеру искать там нельзя."
    # Без output_mode Grep отдаёт список файлов (files_with_matches)
    if [[ -z "$mode" || "$mode" == "count" || "$mode" == "files_with_matches" ]]; then exit 0; fi
    if is_secret "$path" || { [[ -d "$path" ]] && holds_secrets "$path"; } || [[ "$glob" == *env* || "$glob" == *dump* ]]; then
      deny "${path}: здесь лежат секреты — поиск со строками только по каталогам кода (frontend/src, backend/app, docs…)."
    fi
    exit 0
    ;;
esac

deny "инструмента «${tool}» нет в белом списке ревьюера (.claude/hooks/ux-reviewer-guard.sh)."
