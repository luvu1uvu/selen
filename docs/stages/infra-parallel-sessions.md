# LATER-92: параллельные сессии — журнал работ

Карточка: **LATER-92** («Бэклог», метка «инфраструктура»). Ветка `infra/parallel-sessions` от main `8df530a`.
Рабочая копия — основная папка `~/dev/selen`. Задание — описание карточки: замок на dev (Б), свой E2E-стек у каждой
копии (В), правила в CLAUDE.md и runbook (А).

## Сверка фактов карточки (2026-10-22)

- **Через `docker compose exec php`** (контейнер dev): `test-backend`, `lint` (Pint, Larastan), `fix` (Pint), `fresh`,
  `migrate`, `metrics`, `shell`, `admin`. Проверено пробной копией в `.claude/worktrees/`: `exec` из неё попадает
  в контейнер, смонтированный из `~/dev/selen`, — тесты и Larastan идут по чужому коду.
- **Через `docker compose run`** — своя копия: frontend (`run node`), `composer install` в `make up` и `make install`,
  `make key` (`run php`). `run php` требует `.env` в копии (`env_file`): в новой копии без `.env` падает.
- **Не названы в карточке, но тоже бьют по dev чужой копии:** `make down` (останавливает dev), `make destroy`
  (удаляет базу dev), `make db-roles`, `make backup | restore | backup-verify`. У бэкапа база — из dev чужой копии,
  а файлы вложений — из своей папки, поэтому бэкап несогласован. `restore` перетирает чужие данные.
- **E2E:** имя проекта `selen-e2e` и порт `127.0.0.1:8090` фиксированы. В конце `scripts/e2e.sh` (trap) —
  `down -v`. Второй прогон делает `migrate:fresh` в базе первого, конец любого сносит стек обоим. `make e2e-down`
  сносит общий стек. `make perf` использует тот же стек. С разными именами проектов столкнулись бы на порте 8090.
- **Dev сейчас смонтирован из `/Users/ranis/dev/selen`** (`docker inspect selen-php-1`, том `/var/www/backend`).
- **Не было в карточке:**
  - `.env` основной папки отличается от `.env.example` паролями ролей базы и `APP_KEY`. Копия без `.env`
    при `make up` берёт шаблон, и dev, поднятый из неё, не подключится к базе: том инициализирован паролями
    основной папки.
  - Замок на `test-backend`, `lint`, `fix` оставляет сессию без dev без обязательных перед коммитом Pint, Larastan
    и Pest. Хотфикс LATER-61 в рабочей копии обходил это вручную одноразовым контейнером php.

## Решения PM (2026-10-22)

- План принят, тесты backend — **вариант 1**: Pint, Larastan и Pest — в коротком стеке своей копии
  (`selen-test-<папка>`), не через dev. Поправки:
  1. Стек тестов — тот же Postgres 18 и те же init-скрипты (`docker/postgres/init`, `grants.sql`), что у dev и CI:
     роли `selen_owner` / `selen_app` и запреты прав такие же. Защита `TestCase` «только selen_testing» и переменные
     `phpunit.xml` (`<env>` + `<server force>`) — без изменений. Покрытие и число тестов до и после — в журнал.
  2. `dev-take`: вместо копии `.env` основной папки — ссылка на него (один источник секретов). Если ссылка не работает
     с монтированием в Docker — копия, с проверкой, что `.env` рабочей копии не попадает в git; аудитор смотрит это.
  3. CLAUDE.md, «Параллельные сессии», — явно: «одна папка — одна сессия» (в том числе основная `~/dev/selen`)
     и «разрешение на dev-take PM может дать сразу в задании».
  4. Отказ замка — первой строкой что делать: «Попросите PM разрешить make dev-take или дождитесь, пока та сессия
     закончит».

## План

- Замок (`scripts/parallel.sh dev-check`) — первой строкой целей Makefile, работающих с dev: `up`, `restart`, `down`,
  `destroy`, `shell`, `fresh`, `migrate`, `db-roles`, `admin`, `metrics`, `backup`, `restore`, `backup-verify`.
  Чья копия держит dev — источник тома `/var/www/backend` работающего php проекта `selen`, сравнение — точное, по
  физическому пути. Dev не запущен или docker не ответил — без проверки.
- `make dev-take` (только с разрешения PM), `make dev-status`; `.env` рабочей копии — ссылка на `.env` основной.
- Стек проверок backend: `docker-compose.test.yml`, `scripts/test-stack.sh`.
- E2E: проект `selen-e2e-<папка>`, случайный порт на 127.0.0.1, `e2e-down` — только свой стек.
- `make host-status` — строка «Dev: поднят из …».
- CLAUDE.md, runbook, агент и hook аудитора (`make test` / `make lint` теперь и из рабочей копии).

## Замеры тестов backend

| | Тестов | Проверок | Покрытие | Время |
|---|---|---|---|---|
| До (dev, `docker compose exec php`) | 1532 | 7685 | 98,4 % | 127,6 с |

## Сделано

—

## Дальше

- Реализация по плану.
