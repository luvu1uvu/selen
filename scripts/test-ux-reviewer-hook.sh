#!/usr/bin/env bash
# Тест hook агента ux-reviewer (.claude/hooks/ux-reviewer-guard.sh, ADR-0023): make lint и CI.
# Во временном каталоге — макет основной копии с .env и рабочей копией, домашний каталог с сохранённым выводом
# инструментов; hook получает запросы инструментов, как от Claude Code. Ожидаемо: 0 — разрешено, 2 — запрещено.
# Вкладка агента появляется, как в жизни: ответ tabs_create (PostToolUse) → hook запоминает номер.
set -euo pipefail
cd "$(dirname "$0")/.."
HOOK="$PWD/.claude/hooks/ux-reviewer-guard.sh"
AGENT="$PWD/.claude/agents/ux-reviewer.md"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
MAIN="$TMP/main"
HOME_DIR="$TMP/home"
WT="$MAIN/.claude/worktrees/wt"
RESULTS="$HOME_DIR/.claude/projects/-selen/s1/tool-results"
mkdir -p "$MAIN/frontend/src" "$MAIN/backend/bootstrap/cache" "$MAIN/backend/storage/app" "$MAIN/docs" "$WT" \
  "$RESULTS" "$HOME_DIR/.ssh" "$TMP/pm"
touch "$MAIN/.env" "$MAIN/.env.example" "$MAIN/frontend/src/App.tsx" "$MAIN/docs/ui-guidelines.md" \
  "$MAIN/backend/bootstrap/cache/config.php" "$MAIN/backend/storage/app/file.pdf" "$WT/.env" \
  "$RESULTS/shot.jpg" "$HOME_DIR/.ssh/id_ed25519" "$TMP/pm/.env"
ln -s ../.env "$MAIN/docs/link-to-env"

failed=0
total=0

# run <ожидаемый код> <описание> <JSON запроса>
run() {
  local expected="$1" title="$2" json="$3" code=0
  total=$((total + 1))
  HOME="$HOME_DIR" SELEN_MAIN_DIR="$MAIN" SELEN_UX_TABS_DIR="$TMP/tabs" "$HOOK" <<< "$json" > /dev/null 2>&1 || code=$?
  if [[ "$code" != "$expected" ]]; then
    failed=$((failed + 1))
    echo "ПРОВАЛ: ${title} — ожидался код ${expected}, получен ${code}"
  fi
}

# Запрос инструмента: request <событие> <инструмент> <input JSON> [ответ JSON] [агент]
request() {
  jq -nc --arg e "$1" --arg t "$2" --argjson i "$3" --argjson r "${4:-null}" --arg a "${5:-agent-1}" --arg d "$MAIN" \
    '{hook_event_name: $e, session_id: "s1", agent_id: $a, cwd: $d, tool_name: $t, tool_input: $i, tool_response: $r}'
}
B='mcp__Claude_Browser__'

# browser <ожидаемый код> <действие> <input JSON> [агент]
browser() { run "$1" "$2 $3${4:+ (агент $4)}" "$(request PreToolUse "${B}$2" "$3" null "${4:-agent-1}")"; }
# Ответ инструмента браузера (PostToolUse): так hook узнаёт о созданной и закрытой вкладке
after() { run 0 "после $1" "$(request PostToolUse "${B}$1" "$2" "$3" "${4:-agent-1}")"; }
read_case() { run "$1" "Read: $2" "$(request PreToolUse Read "$(jq -nc --arg p "$2" '{file_path: $p}')")"; }
grep_case() {
  run "$1" "Grep: $2 ${3:-}" "$(request PreToolUse Grep \
    "$(jq -nc --arg p "$2" --arg m "${3:-}" '{path: $p, pattern: "x"} + (if $m == "" then {} else {output_mode: $m} end)')")"
}

# Ответ MCP — текст внутри массива блоков (кавычки экранированы), как у встроенного браузера
created() { jq -nc --arg t "$1" '[{type: "text", text: ("{\n  \"serverId\": \"preview-1\",\n  \"tabId\": \"" + $t + "\",\n  \"reused\": false\n}\nOpened tab " + $t + " in the background")}]'; }

# --- Проверка hook и вкладки до создания своей
browser 2 tabs_close '{"tabId": "ux-reviewer-hook-check"}'
browser 0 tabs_context '{}'
browser 2 navigate '{"url": "http://localhost:8080/"}'
browser 2 navigate '{"url": "http://localhost:8080/", "tabId": "seed"}'
browser 2 computer '{"action": "screenshot", "tabId": "tab-1"}'
browser 2 tabs_create '{"foreground": true}'
browser 0 tabs_create '{}'

# Панель браузера закрыта — вкладка не создана, номер не запоминается
after tabs_create '{}' '[{"type": "text", "text": "No tab was created. The Browser pane is not open yet."}]'
browser 2 computer '{"action": "screenshot", "tabId": "tab-1"}'

# --- Своя вкладка tab-2: можно смотреть только dev
after tabs_create '{}' "$(created tab-2)"
browser 0 navigate '{"url": "http://localhost:8080/boards/1", "tabId": "tab-2"}'
browser 0 navigate '{"url": "http://localhost:8080", "tabId": "tab-2"}'
browser 0 navigate '{"url": "http://localhost:8080/spaces/DEV?board=2#top", "tabId": "tab-2"}'
browser 0 computer '{"action": "screenshot", "tabId": "tab-2"}'
browser 0 computer '{"action": "key", "text": "Tab", "tabId": "tab-2"}'
browser 0 resize_window '{"width": 1920, "height": 1080, "colorScheme": "light", "tabId": "tab-2"}'
browser 0 read_page '{"tabId": "tab-2", "filter": "interactive"}'
browser 0 get_page_text '{"tabId": "tab-2"}'
browser 0 find '{"query": "Карточка", "tabId": "tab-2"}'
browser 0 read_console_messages '{"tabId": "tab-2", "onlyErrors": true}'
browser 0 javascript_tool '{"action": "javascript_exec", "tabId": "tab-2", "text": "[...document.querySelectorAll(\"button[type=submit], [title]\")].map(e => e.getBoundingClientRect().width)"}'
browser 0 javascript_tool '{"action": "javascript_exec", "tabId": "tab-2", "text": "new PerformanceObserver(l => window.__s = l.getEntries()).observe({type: \"layout-shift\", buffered: true}); getComputedStyle(document.body).color"}'
browser 0 javascript_tool '{"action": "javascript_exec", "tabId": "tab-2", "text": "document.querySelector(\"[data-board-canvas]\").scrollTop = 600"}'
browser 0 browser_batch '{"actions": [{"name": "navigate", "input": {"url": "http://localhost:8080/boards/2", "tabId": "tab-2"}}, {"name": "computer", "input": {"action": "screenshot", "tabId": "tab-2"}}]}'

# JS-замеры из описания агента (блоки ```js) проходят hook: правка списка запретов не ломает инструкцию незаметно
snippets=0
while IFS= read -r -d '' js; do
  snippets=$((snippets + 1))
  browser 0 javascript_tool "$(jq -nc --arg t "$js" '{action: "javascript_exec", tabId: "tab-2", text: $t}')"
done < <(perl -0777 -ne 'while (/```js\n(.*?)\n```/gs) { print "$1\0" }' "$AGENT")
[[ "$snippets" -ge 5 ]] || { echo "ПРОВАЛ: в описании агента не нашлось JS-замеров (${snippets})"; failed=$((failed + 1)); }

# Мышью — всё, кроме перетаскивания: left_click_drag отпускает карточку (перенос), в пакете тоже
browser 0 computer '{"action": "left_click", "coordinate": [10, 10], "tabId": "tab-2"}'
browser 0 computer '{"action": "hover", "coordinate": [10, 10], "tabId": "tab-2"}'
browser 2 computer '{"action": "left_click_drag", "start_coordinate": [1, 1], "coordinate": [200, 200], "tabId": "tab-2"}'
browser 2 browser_batch '{"actions": [{"name": "computer", "input": {"action": "left_click_drag", "start_coordinate": [1, 1], "coordinate": [9, 9], "tabId": "tab-2"}}]}'

# Номер вкладки — только строка; serverId не нужен
browser 2 computer '{"action": "screenshot", "tabId": ["tab-2"]}'
browser 2 computer '{"action": "screenshot", "tabId": 2}'
browser 2 computer '{"action": "screenshot", "tabId": "tab-2\nseed"}'
browser 2 computer '{"action": "screenshot", "tabId": "tab-2", "serverId": "preview-1"}'

# Чужие вкладки — нельзя, в том числе другому агенту ux-reviewer
browser 2 computer '{"action": "screenshot", "tabId": "seed"}'
browser 2 computer '{"action": "screenshot", "tabId": "tab-2"}' agent-2
browser 2 tabs_close '{"tabId": "seed"}'

# Адреса вне dev: стенд, 127.0.0.1 (cookie общие со стендом), Mailpit, внешние сайты, обходы разбора адреса, API
for url in 'http://127.0.0.1:8081/' 'http://127.0.0.1:8080/' 'http://localhost:8081/' 'http://localhost:8025/' \
  'https://localhost:8080/' 'http://localhost:80800/' 'http://localhost:8080@example.com/' \
  'http://localhost:8080.example.com/' 'https://example.kaiten.ru/space/1' 'HTTP://LOCALHOST:8080/' \
  'javascript:alert(1)' 'file:///etc/passwd' 'data:text/html,x' 'back' 'forward' '' \
  'http://localhost:8080/api/v1/auth/me' 'http://localhost:8080//api/v1/boards' 'http://localhost:8080/sanctum/csrf-cookie' \
  'http://localhost:8080/./api/v1/auth/me' 'http://localhost:8080/x/../api/v1/auth/me' 'http://localhost:8080/%61pi/v1' \
  'http://localhost:8080/\api/v1' 'http://localhost:8080/boards/..' 'http://localhost:8080/API/v1/auth/me' \
  'http://localhost:8080/ x' 'http://localhost:8080/
x'; do
  browser 2 navigate "$(jq -nc --arg u "$url" '{url: $u, tabId: "tab-2"}')"
done
browser 2 navigate '{"tabId": "tab-2"}'

# JS — только чтение страницы
for js in 'fetch("/api/v1/cards", {method: "POST"})' 'window.fetch("/x")' 'new XMLHttpRequest()' \
  'navigator.sendBeacon("/x")' 'new WebSocket("ws://x")' 'location.href = "http://127.0.0.1:8081"' \
  'window.location.assign("/x")' 'history.back()' 'window.open("https://example.com")' 'document.forms[0].submit()' \
  'form.requestSubmit()' 'document.cookie' 'localStorage.setItem("a", 1)' 'sessionStorage.clear()' \
  'indexedDB.deleteDatabase("x")' 'parent.postMessage("x", "*")' 'import("https://example.com/x.js")' \
  'eval("1")' 'new Function("return 1")()' 'document.querySelector("button").click()' \
  'el.dispatchEvent(new MouseEvent("click"))' 'document.write("x")' 'caches.keys()' \
  'navigation.navigate("http://127.0.0.1:8081/")' 'navigation.back()' 'HTMLElement.prototype.click.call(btn)' \
  'btn["click"]()' "btn['click']()"; do
  browser 2 javascript_tool "$(jq -nc --arg t "$js" '{action: "javascript_exec", tabId: "tab-2", text: $t}')"
done

# Пакет: каждый шаг проверяется; создание вкладки и вложенный пакет — нельзя
browser 2 browser_batch '{"actions": [{"name": "computer", "input": {"action": "screenshot", "tabId": "tab-2"}}, {"name": "navigate", "input": {"url": "http://127.0.0.1:8081/", "tabId": "tab-2"}}]}'
browser 2 browser_batch '{"actions": [{"name": "computer", "input": {"action": "screenshot", "tabId": "seed"}}]}'
browser 2 browser_batch '{"actions": [{"name": "computer", "input": {"action": "screenshot"}}]}'
browser 2 browser_batch '{"actions": [{"name": "javascript_tool", "input": {"action": "javascript_exec", "tabId": "tab-2", "text": "fetch(\"/x\")"}}]}'
browser 2 browser_batch '{"actions": [{"name": "tabs_create", "input": {}}]}'
browser 2 browser_batch '{"actions": [{"name": "tabs_close", "input": {"tabId": "tab-2"}}]}'
browser 2 browser_batch '{"actions": [{"name": "browser_batch", "input": {"actions": []}}]}'
browser 2 browser_batch '{"actions": [{"name": "tabs_select", "input": {"tabId": "tab-2"}}]}'
browser 2 browser_batch '{"actions": "x"}'

# Инструменты браузера, которых нет в белом списке
browser 2 tabs_select '{"tabId": "tab-2"}'
browser 2 form_input '{"ref": "ref_1", "value": "x", "tabId": "tab-2"}'
browser 2 preview_start '{"url": "http://localhost:8080"}'
browser 2 read_network_requests '{"tabId": "tab-2"}'
run 2 'встроенный браузер под другим префиксом' "$(request PreToolUse mcp__remote-devices__Claude_Browser__navigate '{"url": "http://localhost:8080/", "tabId": "tab-2"}')"

# Закрыл свою вкладку — дальше она не своя
browser 0 tabs_close '{"tabId": "tab-2"}'
after tabs_close '{"tabId": "tab-2"}' '[{"type": "text", "text": "Closed tab tab-2."}]'
browser 2 computer '{"action": "screenshot", "tabId": "tab-2"}'

# Ответ — объект, а не текст: номер тоже находится
after tabs_create '{}' '{"tabId": "tab-7", "reused": false}'
browser 0 computer '{"action": "screenshot", "tabId": "tab-7"}'

# Панель закрыли — tabs_create открыл её заново и ответил общей вкладкой seed (или окном popup-N): не своя
after tabs_create '{}' "$(created seed)"
browser 2 computer '{"action": "screenshot", "tabId": "seed"}'
browser 2 tabs_close '{"tabId": "seed"}'
after tabs_create '{}' "$(created popup-3)"
browser 2 computer '{"action": "screenshot", "tabId": "popup-3"}'

# Две свои вкладки: закрыл одну — вторая остаётся своей
after tabs_create '{}' "$(created tab-8)"
after tabs_close '{"tabId": "tab-7"}' '[{"type": "text", "text": "Closed tab tab-7."}]'
browser 2 computer '{"action": "screenshot", "tabId": "tab-7"}'
browser 0 computer '{"action": "screenshot", "tabId": "tab-8"}'

# Нет agent_id — ключ по session_id: вкладка запоминается и узнаётся так же
run 0 'после tabs_create без agent_id' "$(jq -nc --arg d "$MAIN" --argjson r "$(created tab-11)" \
  '{hook_event_name: "PostToolUse", session_id: "s9", cwd: $d, tool_name: "mcp__Claude_Browser__tabs_create", tool_input: {}, tool_response: $r}')"
run 0 'своя вкладка по session_id' "$(jq -nc --arg d "$MAIN" \
  '{hook_event_name: "PreToolUse", session_id: "s9", cwd: $d, tool_name: "mcp__Claude_Browser__computer", tool_input: {action: "screenshot", tabId: "tab-11"}}')"
run 2 'вкладка session_id чужому агенту' "$(jq -nc --arg d "$MAIN" \
  '{hook_event_name: "PreToolUse", session_id: "s9", agent_id: "agent-1", cwd: $d, tool_name: "mcp__Claude_Browser__computer", tool_input: {action: "screenshot", tabId: "tab-11"}}')"

# Нет номера агента и сессии — свою вкладку не определить
run 2 'нет номера агента и сессии' '{"tool_name": "mcp__Claude_Browser__tabs_context", "tool_input": {}}'
run 2 'номер агента с путём' "$(request PreToolUse "${B}tabs_context" '{}' null '../x')"

# --- Чтение кода
read_case 0 "$MAIN/frontend/src/App.tsx"
read_case 0 "$MAIN/docs/ui-guidelines.md"
read_case 0 "$MAIN/.env.example"
read_case 0 "$RESULTS/shot.jpg"
read_case 0 'docs/ui-guidelines.md'
read_case 2 "$MAIN/.env"
read_case 2 "$WT/.env"
read_case 2 "$MAIN/docs/link-to-env"
read_case 2 "$MAIN/backend/bootstrap/cache/config.php"
read_case 2 "$MAIN/backend/storage/app/file.pdf"
read_case 2 "$MAIN/frontend/../.env"
read_case 2 "$HOME_DIR/.ssh/id_ed25519"
read_case 2 "$TMP/pm/.env"
grep_case 0 "$MAIN/frontend/src" content
grep_case 0 "$MAIN"
grep_case 0 "$MAIN" count
grep_case 2 "$MAIN" content
grep_case 2 "$MAIN/backend/bootstrap" content
grep_case 2 "$WT" content
grep_case 2 "$TMP/pm" count
run 2 'Grep со строками по шаблону .env' "$(request PreToolUse Grep "$(jq -nc --arg p "$MAIN/frontend" '{path: $p, pattern: "x", glob: "*.env*", output_mode: "content"}')")"

# --- Остальные инструменты — нет. В жизни их не даёт список tools: описания агента (matcher hook их не ловит); здесь —
# запрет по умолчанию в самом hook
run 2 'Bash' "$(request PreToolUse Bash '{"command": "ls"}')"
run 2 'Write' "$(request PreToolUse Write "$(jq -nc --arg p "$MAIN/docs/x.md" '{file_path: $p, content: "x"}')")"
run 2 'Claude in Chrome' "$(request PreToolUse mcp__claude-in-chrome__navigate '{"url": "http://localhost:8080/"}')"

if [[ "$failed" -ne 0 ]]; then
  echo "Hook ux-reviewer: провалено ${failed} из ${total}." >&2
  exit 1
fi
echo "Hook ux-reviewer: ${total} проверок пройдено."
