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
- **Почему проверка упала на medium.** `scripts/deps-audit.sh` вызывает `composer audit … --ignore-severity=low
  --ignore-severity=medium --format=summary`. Composer 2.10.3 с `--format=summary` завершается кодом 1, даже когда
  единственная уязвимость пропущена по уровню; с `--format=table` и `--format=json` тот же вызов — код 0 («Ignore reason:
  medium severity is ignored»). То есть проверка сейчас роняет CI и на medium. В этом хотфиксе скрипт не менялся (задание
  — только обновление пакета); вопрос PM — в отчёте.

## Сделано

- `./scripts/test-stack.sh composer update symfony/mime` — в `backend/composer.lock` изменился только `symfony/mime`
  (v8.1.7 → v8.1.10, 6 строк); `composer.json` не менялся (ограничение и так допускает 8.1.10); других пакетов
  обновление не потянуло. `composer audit` после обновления — «No security vulnerability advisories found».
