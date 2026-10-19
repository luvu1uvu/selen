#!/usr/bin/env bash
# Уязвимости зависимостей (ADR-0020): make audit-deps, CI (.github/workflows/security.yml), агент security-auditor.
# Проверка падает на уязвимостях high и critical; low, medium и заброшенные пакеты — только в выводе.
#   composer — по backend/composer.lock, npm — по package-lock.json в frontend и e2e; пакеты не устанавливаются.
# В CI composer и npm ставят setup-php и setup-node. Локально их нет (всё в Docker) — берутся образы dev:
# selen-php:dev (появляется после make up) и node:24-alpine, файлы зависимостей монтируются только для чтения.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PHP_IMAGE="${PHP_IMAGE:-selen-php:dev}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
failed=""

composer_backend() {
  if command -v composer > /dev/null; then
    (cd backend && composer "$@")
  else
    docker run --rm -v "${ROOT}/backend/composer.json:/app/composer.json:ro" \
      -v "${ROOT}/backend/composer.lock:/app/composer.lock:ro" -w /app "$PHP_IMAGE" composer "$@"
  fi
}

npm_audit() {
  local dir="$1" args=(audit --package-lock-only --audit-level=high)
  if command -v npm > /dev/null; then
    (cd "$dir" && npm "${args[@]}")
  else
    docker run --rm -v "${ROOT}/${dir}/package.json:/w/package.json:ro" \
      -v "${ROOT}/${dir}/package-lock.json:/w/package-lock.json:ro" -w /w "$NODE_IMAGE" npm "${args[@]}"
  fi
}

echo "== composer (backend): все уязвимости и заброшенные пакеты — для сведения, проверку не роняют"
composer_backend audit --locked --no-interaction --abandoned=report || true

echo "== composer (backend): уязвимости high и critical"
composer_backend audit --locked --no-interaction --abandoned=ignore --ignore-severity=low --ignore-severity=medium \
  --format=summary || failed="${failed} composer (backend);"

for dir in frontend e2e; do
  echo "== npm (${dir}): все уязвимости; проверку роняют high и critical"
  npm_audit "$dir" || failed="${failed} npm (${dir});"
done

if [[ -n "$failed" ]]; then
  echo "Проверка не прошла:${failed} уязвимость high/critical или ошибка запуска — см. вывод выше. Уязвимость —" \
    "карточка или хотфикс с обновлением зависимости (ADR-0020)." >&2
  exit 1
fi
echo "Уязвимостей high и critical нет."
