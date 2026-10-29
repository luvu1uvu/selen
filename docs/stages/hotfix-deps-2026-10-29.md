# Хотфикс зависимостей 2026-10-29: symfony/mime 8.1.10 (CVE-2026-45070) — журнал работ

Карточка: **LATER-144** («Бэклог», «Взято в работу», заведена `make pm-task`). Ветка `hotfix/deps-2026-10-29` от main
`19f1c3a`.

## Задание PM (29.10)

Security упал на PR #42 («П2c-2») на коммите только с документами — значит, новая уязвимость в зависимостях, не из-за
ветки. По CLAUDE.md («Проверки безопасности в CI»): `make audit-deps` — пакет и уязвимость; хотфикс от свежего main —
минимальное обновление уязвимого пакета без попутных обновлений, `make lint && make test && make e2e`, PR. Мёрж — после
«принято» и зелёного CI в обоих прогонах; затем `git merge main` в `rights-2c2`, зелёный CI и мёрж #42. Если обновление
ломает совместимость или исправленной версии нет — стоп и вопрос PM.

## Что нашли

- Упала проверка «Зависимости (composer audit, npm audit — high/critical)» (gitleaks — зелёный), и в push, и в
  pull_request (`09be154`); npm (frontend, e2e) — 0 уязвимостей.
- **symfony/mime v8.1.7** — **CVE-2026-45070** / **GHSA-vqc8-7275-q272** (PKSA-wtxr-p26d-nn42), «Email Header Injection
  via Non-Token Characters in Mime Parameter Names», опубликована 2026-10-28 18:08 UTC. Уровень — **medium** (GitHub:
  CVSS 4.0 — 4.9). Затронуты 8.1.0–8.1.9; **исправлено в 8.1.10** (ветки 5.4.55, 6.4.49, 7.4.22 — у других линеек).
- **Почему проверка упала на medium — поведение Composer 2.10.3** (дополнение PM к заданию 29.10: скрипт верит коду
  выхода `composer audit`, а версия Composer не зафиксирована — `composer:v2` в CI, `composer:2` в Dockerfile).
  - Версия: `Composer version 2.10.3 2026-08-27 13:34:23` (образ `selen-php:dev`); в CI — та же (лог «Security»,
    `setup-php`: «Added composer 2.10.3»).
  - Команда (как в прежнем `scripts/deps-audit.sh`, `composer.lock` с одной medium-уязвимостью — `symfony/mime` 8.1.7):
    `composer audit --locked --no-interaction --abandoned=ignore --ignore-severity=low --ignore-severity=medium
    --format=summary` → «Found 1 security vulnerability advisory affecting 1 package.», **код выхода 1**.
  - Тот же вызов с `--format=table` и `--format=json` — **код 0**, уязвимость — в «ignored-advisories» с причиной
    «medium severity is ignored».
  - Причина — в исходнике Composer 2.10.3 (`src/Composer/Advisory/Auditor.php`, метод `audit()`): в формате `summary`
    он загружает «неполные» записи уязвимостей (`PartialSecurityAdvisory`, без уровня) и догружает полные
    (`needsCompleteAdvisoryLoad`) только если в списке игнорируемых есть ID не вида `PKSA-…`; игнорируемые уровни
    (`--ignore-severity`) при этом не учитываются. В `processAdvisories()` фильтр по уровню применяется только к полной
    записи (`SecurityAdvisory`), неполная остаётся «активной» — отсюда код 1.
  - Issue в composer/composer по этому поведению поиском (`gh search issues`, API поиска: «ignore-severity», «audit
    summary», «summary severity») **не нашёл**. Есть 2.11.0-RC1 (22.10) — исправлено ли там, не проверял.

## Скрипт проверки — без кода выхода composer audit

- `scripts/deps-audit.sh`: проверка composer (high/critical) — `composer audit --locked --no-interaction
  --abandoned=ignore --format=json`, код выхода composer не смотрится; уязвимости отбирает сам скрипт (`php -r`: в CI —
  `setup-php`, локально — образ `selen-php:dev`): провал — high, critical и уязвимость без уровня (как прежнее
  `--ignore-severity=low --ignore-severity=medium`); пустой или неразбираемый ответ (composer не запустился, битый
  `composer.lock`) — провал с сообщением «Ответ composer audit не разобрать…». Найденные high/critical выводятся
  строками «пакет: CVE, уровень — название». Версия Composer не фиксируется. Справочный вывод (все уязвимости и
  заброшенные пакеты) и npm — без изменений. ADR-0020, «Изменения».
- **Проверка** (подменный `backend/composer.lock`, после каждого прогона — `git checkout backend/composer.lock`;
  временная папка `.deps-probe/` в копии — Docker не видит `/private/tmp`, удалена):

  | Случай | `composer.lock` | Скрипт | Код выхода | Вывод проверки composer |
  |---|---|---|---|---|
  | A0 | из main: `symfony/mime` 8.1.7 (одна medium) | прежний (из main) | 1 | «Found 1 security vulnerability advisory…» |
  | A | то же | новый | **0** | «Уязвимостей high и critical нет.» |
  | B | хотфикса + `guzzlehttp/guzzle` 7.4.4 | новый | **1** | CVE-2026-69246, CVE-2022-31091, CVE-2022-31090 — high |
  | C | битый (`{ это не JSON`) | новый | **1** | «Ответ composer audit не разобрать…» |
  | D | хотфикса (`symfony/mime` 8.1.10) | новый | **0** | «Уязвимостей high и critical нет.» |


## Сделано

- `./scripts/test-stack.sh composer update symfony/mime` — в `backend/composer.lock` изменился только `symfony/mime`
  (v8.1.7 → v8.1.10, 6 строк); `composer.json` не менялся (ограничение и так допускает 8.1.10); других пакетов
  обновление не потянуло. `composer audit` после обновления — «No security vulnerability advisories found».

## Прогоны перед PR

- `395ecf5` (обновление symfony/mime): `make audit-deps` — зелёный; `make lint` — зелёный; `make test` — backend 2917
  тестов, покрытие 98,3 %, frontend 59 файлов; `make e2e` — 309 + 21 («одна компания»), все зелёные.
- `84e3f12` (скрипт и документы): `make lint` — зелёный (`scripts/check-scripts.sh`), `make audit-deps` — «Уязвимостей
  high и critical нет.»; код приложения после `395ecf5` не менялся — `make test` и `make e2e` не повторялись.

