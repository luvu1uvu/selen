#!/usr/bin/env bash
# Замер производительности (Playwright) на изолированном стеке E2E: доска на 300 карточек (board.perf.ts) и страница
# пространства из 5 досок по 200 карточек рядами (space.perf.ts). Production-сборка фронтенда, демо-данные
# DemoSeeder + BoardsDemoSeeder + PerfSpaceSeeder. Запуск: make perf.
# Методика и как читать результат — docs/runbook.md, раздел «Производительность доски».
# Стек — тот же, что у make e2e этой рабочей копии (проект selen-e2e-<папка>, LATER-92).
set -euo pipefail
cd "$(dirname "$0")/.."

E2E=(docker compose -p "$(./scripts/parallel.sh project e2e)" -f docker-compose.e2e.yml)
trap '"${E2E[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf e2e/.attachments' EXIT
# Каталог вложений стека создаём от имени пользователя хоста — php в контейнере пишет под тем же UID
rm -rf e2e/.attachments && mkdir -p e2e/.attachments

test -d backend/vendor || "${E2E[@]}" run --rm --no-deps -T php composer install --no-interaction --no-progress
test -d frontend/node_modules || "${E2E[@]}" run --rm --no-deps -T builder npm ci --no-audit --no-fund
"${E2E[@]}" run --rm --no-deps -T builder npm run build

"${E2E[@]}" up -d --build --wait postgres redis php nginx
"${E2E[@]}" exec -T php php artisan migrate:fresh --force --database=pgsql_owner
"${E2E[@]}" exec -T php php artisan db:seed --class=DemoSeeder --force
"${E2E[@]}" exec -T php php artisan db:seed --class=BoardsDemoSeeder --force
"${E2E[@]}" exec -T php php artisan db:seed --class=PerfSpaceSeeder --force

"${E2E[@]}" run --rm -T -e PERF_RUNS="${PERF_RUNS:-5}" playwright \
  sh -c "npm ci --no-audit --no-fund && npx playwright test -c perf.config.ts"
