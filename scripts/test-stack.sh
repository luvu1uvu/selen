#!/usr/bin/env bash
# Команда в стеке проверок backend этой рабочей копии (docker-compose.test.yml), а не в dev: dev работает с кодом той
# копии, из которой его подняли (LATER-92, docs/runbook.md, «Параллельные сессии»). Проект — selen-test-<папка>-<номер
# процесса>: у каждой команды свой, make lint и make test одной копии не снесут стеки друг друга. Стек удаляется после
# команды при любом исходе. Код выхода — код команды.
# Два прогона Pest в одной копии одновременно всё равно мешают друг другу: Storage::fake пишет в её
# backend/storage/framework/testing (одна папка — одна сессия).
#
#   ./scripts/test-stack.sh <команда…>        — без базы: Pint, Larastan, composer (make lint, make fix, make install)
#   ./scripts/test-stack.sh --db <команда…>   — с Postgres и Redis: Pest (make test-backend). Один тест, например:
#   ./scripts/test-stack.sh --db vendor/bin/pest --filter=LoginTest
set -euo pipefail
cd "$(dirname "$0")/.."

# Makefile их экспортирует; при прямом вызове — пользователь хоста (сборка образа, если его ещё нет)
export HOST_UID="${HOST_UID:-$(id -u)}" HOST_GID="${HOST_GID:-$(id -g)}"

DEPS=(--no-deps)
if [[ "${1:-}" == "--db" ]]; then
  DEPS=()
  shift
fi
[[ $# -gt 0 ]] || { echo "Укажите команду: ./scripts/test-stack.sh [--db] vendor/bin/pest …" >&2; exit 1; }

STACK=(docker compose -p "$(./scripts/parallel.sh project test)-$$" -f docker-compose.test.yml)
trap '"${STACK[@]}" down -v --remove-orphans > /dev/null 2>&1 || true' EXIT

test -d backend/vendor || "${STACK[@]}" run --rm --no-deps -T php composer install --no-interaction --no-progress
"${STACK[@]}" run --rm ${DEPS[@]+"${DEPS[@]}"} -T php "$@"
