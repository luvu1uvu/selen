#!/usr/bin/env bash
# Уязвимости зависимостей (ADR-0020): make audit-deps, CI (.github/workflows/security.yml), агент security-auditor.
# Проверка падает на уязвимостях high и critical; low, medium и заброшенные пакеты — только в выводе. Уровень уязвимостей
# composer скрипт отбирает сам по JSON-ответу composer audit, а не по его коду выхода (хотфикс deps-2026-10-29).
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

# PHP — для разбора ответа composer audit: в CI его ставит setup-php, локально — тот же образ dev
php_backend() {
  if command -v php > /dev/null; then
    php "$@"
  else
    docker run --rm -i "$PHP_IMAGE" php "$@"
  fi
}

# Уязвимости high и critical — по JSON-ответу composer audit, код выхода composer не смотрим: Composer 2.10.3 с
# --format=summary завершается кодом 1 и тогда, когда все уязвимости пропущены --ignore-severity (в этом формате он
# грузит записи без уровня; журнал docs/stages/hotfix-deps-2026-10-29.md, ADR-0020). Проверку роняют high, critical и
# уязвимость без уровня (как прежнее --ignore-severity=low --ignore-severity=medium), а также не запустившийся composer
# и ответ, который не разобрать.
composer_high_critical() {
  local json
  json="$(composer_backend audit --locked --no-interaction --abandoned=ignore --format=json)" || true
  printf '%s' "$json" | php_backend -r '
    $data = json_decode(stream_get_contents(STDIN), true);
    if (!is_array($data) || !isset($data["advisories"]) || !is_array($data["advisories"])) {
        fwrite(STDERR, "Ответ composer audit не разобрать (нет JSON с advisories) — проверка не пройдена.\n");
        exit(2);
    }
    $found = 0;
    foreach ($data["advisories"] as $package => $advisories) {
        foreach ((array) $advisories as $advisory) {
            $severity = is_array($advisory) && is_string($advisory["severity"] ?? null) ? strtolower($advisory["severity"]) : "";
            if ($severity === "low" || $severity === "medium") {
                continue;
            }
            $found++;
            printf("%s: %s, уровень %s — %s\n", $package, $advisory["cve"] ?? $advisory["advisoryId"] ?? "?",
                $severity === "" ? "не указан" : $severity, $advisory["title"] ?? "");
        }
    }
    echo $found === 0 ? "Уязвимостей high и critical нет.\n" : "Уязвимостей high и critical: " . $found . ".\n";
    exit($found === 0 ? 0 : 1);
  '
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
composer_high_critical || failed="${failed} composer (backend);"

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
