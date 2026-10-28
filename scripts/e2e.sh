#!/usr/bin/env bash
# E2E-тесты в браузере (Playwright) на изолированном стеке docker-compose.e2e.yml.
# Запуск: make e2e. Стек останавливается и его данные удаляются при любом исходе.
# Стек — свой у каждой рабочей копии (проект selen-e2e-<папка>, LATER-92): прогоны из разных копий не мешают друг другу.
#
#   ./scripts/e2e.sh [фильтры Playwright]   — например acceptance/stage-3/ (make e2e-stage STAGE=3)
#   TC=3.8,3.9 ./scripts/e2e.sh             — только автотесты этих тест-кейсов, теги @tc-3.8 и @tc-3.9 (make e2e-tc)
#
# Два прогона на одном стеке (ADR-0026): сначала всё в режиме «несколько компаний», затем тесты с тегом @single-company —
# php пересоздан с SELEN_MULTI_COMPANY=false, данные E2eSeeder те же, вход — сохранённый первым прогоном (e2e/.auth).
set -euo pipefail
cd "$(dirname "$0")/.."

ARGS=("$@")
if [[ -n "${TC:-}" ]]; then
  [[ "$TC" =~ ^[A-Za-z0-9.,\ ]+$ ]] || { echo "TC — номера тест-кейсов через запятую, например TC=3.8,3.9" >&2; exit 1; }
  # @tc-3.8 не должен совпасть с @tc-3.80: после номера — не буква, не цифра и не точка
  PATTERN="$(printf '%s' "$TC" | tr -d ' ' | sed -e 's/\./\\./g' -e 's/,/|/g')"
  ARGS+=(--grep "@tc-(${PATTERN})(?![A-Za-z0-9.])")
fi

PROJECT="$(./scripts/parallel.sh project e2e)"
E2E=(docker compose -p "$PROJECT" -f docker-compose.e2e.yml)
trap '"${E2E[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf e2e/.attachments e2e/.auth' EXIT
# Каталог вложений стека создаём от имени пользователя хоста — php в контейнере пишет под тем же UID. Вход прошлого
# прогона (убитого до trap) — от удалённой базы: второй прогон взял бы его вместо нового входа
rm -rf e2e/.attachments e2e/.auth && mkdir -p e2e/.attachments

test -d backend/vendor || "${E2E[@]}" run --rm --no-deps -T php composer install --no-interaction --no-progress
test -d frontend/node_modules || "${E2E[@]}" run --rm --no-deps -T builder npm ci --no-audit --no-fund
"${E2E[@]}" run --rm --no-deps -T builder npm run build

"${E2E[@]}" up -d --build --wait postgres redis php nginx
echo "Стек E2E ${PROJECT}: http://$("${E2E[@]}" port nginx 80) — пока идёт прогон"
"${E2E[@]}" exec -T php php artisan migrate:fresh --seed --seeder=E2eSeeder --force --database=pgsql_owner

"${E2E[@]}" run --rm -T playwright npm ci --no-audit --no-fund
# Тесты режима «одна компания» под теми же фильтрами. Тег — только в названии теста: в выводе --list опция tag не видна
SINGLE="$("${E2E[@]}" run --rm -T -e E2E_SINGLE_COMPANY=1 playwright \
  npx playwright test --list --pass-with-no-tests ${ARGS[@]+"${ARGS[@]}"})"
SINGLE_TESTS="$(grep -c '@single-company' <<< "$SINGLE" || true)"
# Фильтр, под который попали только такие тесты, — первый прогон пустой; без них «No tests found» по-прежнему ошибка
PASS=()
[[ "$SINGLE_TESTS" -eq 0 ]] || PASS=(--pass-with-no-tests)

"${E2E[@]}" run --rm -T playwright npx playwright test ${PASS[@]+"${PASS[@]}"} ${ARGS[@]+"${ARGS[@]}"}

if [[ "$SINGLE_TESTS" -gt 0 ]]; then
  echo "Режим «одна компания»: тестов — ${SINGLE_TESTS}, php пересоздаётся с SELEN_MULTI_COMPANY=false"
  # Для всех команд compose дальше: иначе run playwright (depends_on → nginx → php) вернул бы php прежний режим
  export E2E_MULTI_COMPANY=false
  "${E2E[@]}" up -d --wait --force-recreate --no-deps php nginx
  echo "Стек E2E ${PROJECT} (режим «одна компания»): http://$("${E2E[@]}" port nginx 80)"
  # Первый прогон без тестов (фильтр только по ним) не входил — тогда вход здесь
  DEPS=()
  [[ ! -d e2e/.auth ]] || DEPS=(--no-deps)
  "${E2E[@]}" run --rm -T -e E2E_SINGLE_COMPANY=1 playwright \
    npx playwright test ${DEPS[@]+"${DEPS[@]}"} ${ARGS[@]+"${ARGS[@]}"}
fi
