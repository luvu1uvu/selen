# Хотфикс LATER-69: `make host-worktrees-clean` после «y» не перепроверяет копию — журнал работ

Карточка: **LATER-69** («Баги приёмки», метка «безопасность»; точечный аудит 2026-10-19, S-1). Ветка `hotfix/later-69`
от main `b919574` (после PR 2 пакета раскладки, как велел PM). Отчёт аудита —
`docs/security/audit-2026-10-19-host-worktrees.md` (перенесён из заметок сессии аудита, без реальных данных).

## Решения PM (19.10, комментарий к карточке)

- Объём: S-1 — после «y» заново проверить каждую копию прямо перед удалением; блокировку снимать, только если копия
  по-прежнему проходит все проверки. S-3 — защита файлов вне git не зависит от `status.showUntrackedFiles` и других
  настроек git. S-5, S-7 — как предложил аудитор.
- Очистка трогает только копии сессий Remote Control; любые другие копии в `.claude/worktrees` (в том числе сессий
  приложения Claude) — в «Оставлены» с причиной «не Remote Control» (ADR-0018, «Изменения»). Формат блокировки
  Remote Control — сверить на первой живой копии.
- Тест скрипта на временном репозитории — в `make lint` и CI.
- До исправления `make host-worktrees-clean` с ответом «y» не запускать.

## Сделано

- **Формат копии Remote Control** сверен по выводу `git worktree list --porcelain` с живой копией сервера (16–19.10,
  история сессий Claude Code на Mac mini): каталог `bridge-cse_<id>`, ветка `worktree-bridge-cse_<id>`, блокировка
  `claude agent bridge-cse_<id> (pid <сервер> start <время запуска>)`. Сейчас живых копий Remote Control нет; копия
  сессии приложения Claude в `.claude/worktrees` есть — исправленный скрипт оставляет её с причиной «не Remote Control»
  (просмотр без «y»).
- **`scripts/host.sh`:**
  - копия Remote Control — только `bridge-cse_<буквы и цифры>` прямо в `.claude/worktrees`, блокировка — только
    формата сервера для этой копии;
  - после «y» — `worktree_recheck` для каждой копии: свежие `lsof`, `docker compose ls`, коммит, ветка и блокировка,
    все проверки заново; изменились коммит, ветка или блокировка — «НЕ удалена» с причиной;
  - `worktree_remove`: блокировка снимается только после перепроверки; `git worktree remove` отказался — блокировка
    возвращается;
  - `git status` с явными флагами (`--untracked-files=normal --ignored=traditional`) — при
    `status.showUntrackedFiles=no` git скрывал и игнорируемые `.env` и дампы (проверено опытом);
    `git -c status.showUntrackedFiles=all worktree remove` — второй рубеж; `git rev-list` вместо `git log`;
    `--no-optional-locks` (S-5);
  - docker не ответил — ничего не удаляется (`make host-status` — «не проверены»); сбой `grep`/`awk` — «оставить»;
  - подтверждение — только из терминала (S-7); при подключении через `source` — только функции (для теста).
- **Тест** `scripts/test-host-worktrees.sh` (в `scripts/check-scripts.sh` → `make lint`, CI): временный репозиторий с
  «GitHub», 32 проверки; ответ «y» подменяется, и до ответа тест меняет копии. На коде до исправления (с той же точкой
  подмены ответа) падают 19 проверок из 32, в том числе шаги карточки.
- Документы: runbook («Remote Control: подключение и перезапуск»), ADR-0018 («Изменения», 2026-10-20), отчёт аудита,
  строка итога аудита — в журнале пакета раскладки.

## Как проверить руками (Mac mini)

Предусловия для всех: PR смёржен, выполнен `make pm-update`; Терминал, папка `~/dev/selen`; перед первым тест-кейсом —
`git fetch`.

### ТК-L69.1. Копия, изменившаяся во время вопроса, не удаляется
Зачем: если пока вы отвечали на вопрос, в копии появились файлы или блокировка, очистка её не удаляет (шаги карточки).
Предусловия: общие.
Шаги:
1. `git worktree add .claude/worktrees/bridge-cse_test1 -b worktree-bridge-cse_test1 origin/main`
2. `make host-worktrees-clean` — на вопрос `[y/N]` пока не отвечать.
3. Во втором окне Терминала: `touch ~/dev/selen/.claude/worktrees/bridge-cse_test1/.env` и
   `git -C ~/dev/selen worktree lock --reason test ~/dev/selen/.claude/worktrees/bridge-cse_test1`
4. В первом окне ответить `y`.
5. `git worktree list`
Ожидаемый результат:
- В шаге 2 `bridge-cse_test1` — в списке «Можно удалить».
- В шаге 4 — строка «bridge-cse_test1: НЕ удалена — заблокирована не сервером Remote Control: test».
- В шаге 5 копия `bridge-cse_test1` на месте и с пометкой `locked`; папка и файл `.env` в ней есть.
Если не так: вывод команд из Терминала.

### ТК-L69.2. Завершённая копия Remote Control без изменений удаляется
Зачем: очистка по-прежнему убирает то, что можно убрать.
Предусловия: выполнен ТК-L69.1.
Шаги:
1. `git worktree unlock .claude/worktrees/bridge-cse_test1` и `rm .claude/worktrees/bridge-cse_test1/.env`
2. `make host-worktrees-clean`, ответить `y`.
3. `git worktree list` и `git branch --list worktree-bridge-cse_test1`
Ожидаемый результат:
- В шаге 2 — «bridge-cse_test1: удалена».
- В шаге 3 копии `bridge-cse_test1` нет, ветки `worktree-bridge-cse_test1` нет.
Если не так: вывод команд из Терминала.

### ТК-L69.3. Копии других сессий очистка не трогает
Зачем: копии сессий приложения Claude и `claude --worktree` не удаляются, даже если сессия простаивает (решение PM).
Предусловия: общие.
Шаги:
1. `git worktree add .claude/worktrees/app-test -b app-test origin/main`
2. `make host-worktrees-clean`, если спросит — ответить `n`.
3. Убрать за собой: `git worktree remove .claude/worktrees/app-test` и `git branch -d app-test`
Ожидаемый результат:
- В шаге 2 — в «Оставлены»: «app-test — не Remote Control»; копии сессий приложения Claude (если есть) — с той же
  причиной. В «Можно удалить» их нет.
Если не так: вывод команды из Терминала.

### ТК-L69.4. Подтверждение не с клавиатуры не удаляет
Зачем: «y», пришедшее не от человека в Терминале (например, от агента), ничего не удаляет.
Предусловия: общие.
Шаги:
1. `git worktree add .claude/worktrees/bridge-cse_test2 -b worktree-bridge-cse_test2 origin/main`
2. `echo y | make host-worktrees-clean`
3. `make host-worktrees-clean`, ответить `y` (убрать за собой).
Ожидаемый результат:
- В шаге 2 `bridge-cse_test2` — в «Можно удалить», затем «Удалить можно только с подтверждением в окне Терминала
  (make host-worktrees-clean). Ничего не удалено.»; копия на месте.
- В шаге 3 — «bridge-cse_test2: удалена».
Если не так: вывод команд из Терминала.

| Тест-кейс | Автотест |
|---|---|
| ТК-L69.1 | `scripts/test-host-worktrees.sh`, раздел 3 (шаги карточки) |
| ТК-L69.2 | `scripts/test-host-worktrees.sh`, разделы 1–3 (чистая копия, брошенная блокировка) |
| ТК-L69.3 | `scripts/test-host-worktrees.sh`, раздел 1 (копии приложения Claude и `claude --worktree`) |
| ТК-L69.4 | `scripts/test-host-worktrees.sh`, раздел 5 |
