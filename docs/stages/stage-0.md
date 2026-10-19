# Этап 0: журнал работ

Рабочий журнал этапа «Фундамент». Обновлялся после каждого крупного блока, чтобы новая сессия
(или другой человек) могла продолжить с того же места. Итоговый отчёт — [stage-0-report.md](stage-0-report.md).

## Статус: этап завершён, ждёт проверки PM

PR `stage-0` → `main` открыт и **не мёржится** до проверки отчёта PM.

| # | Блок | Статус |
|---|------|--------|
| 0 | Colima + Docker на машине разработчика | ✅ |
| 1 | Скелет репозитория, GitHub (private `luvu1uvu/selen`, теперь архив: selen-archive), ветка `stage-0` | ✅ |
| 2 | Docker Compose, Makefile, .env.example | ✅ `make up && make fresh` на чистом клоне |
| 3 | Каркас Laravel, Pint, Larastan, Pest | ✅ |
| 4 | Пользователи, enums, журнал событий | ✅ |
| 5 | Аутентификация (вход/выход/remember/смена/сброс пароля) | ✅ |
| 6 | Приглашения и почта | ✅ письма проверены в Mailpit |
| 7 | Админка пользователей, политики, `app:create-admin` | ✅ |
| 8 | Frontend: каркас, i18n, UI-kit, страницы | ✅ ручной прогон сценария в браузере |
| 9 | Бэкапы и проверка восстановления | ✅ `make backup-verify`, ротация 7+4 |
| 10 | CI (GitHub Actions) | ✅ зелёный |
| 11 | Документация, отчёт | ✅ |

## Что дальше

1. PM проверяет отчёт и мёржит PR.
2. Ответы на вопросы из раздела 8 отчёта → план этапа 1 (доски, колонки, карточки, `card_transitions`).

## Проблемы и находки этапа (для следующих сессий)

- Pest 5.3 `--parallel` несовместим с текущей paratest — тесты в один поток (~5 с).
- В контейнере переменные .env попадают в `$_SERVER`: в phpunit.xml каждая переменная задана и как `<env>`,
  и как `<server>` с force="true"; защита — `tests/TestCase::createApplication` (только `selen_testing*`).
- В тестах между запросами нужно сбрасывать guard'ы, `auth.driver` и сессию — это делает `tests/Support/Browser.php`.
- Prettier в CI видит корневой `.editorconfig` — в `.prettierrc.json` явно задан `tabWidth: 2`.
- nginx кеширует IP upstream'ов — в конфиге используется `resolver 127.0.0.11` и переменные.
- Colima монтирует только `~` — проект и временные копии держать внутри домашнего каталога.
- Скелет Laravel 13 кладёт в backend/ AGENTS.md/CLAUDE.md (Laravel Boost) — удалены.

## Итоговые цифры

- Backend: 74 теста, 371 проверка, покрытие 99,1 %. Larastan level 6 — 0 ошибок, Pint — чисто.
- Frontend: 26 тестов, покрытие строк 73,5 %. ESLint, Prettier, tsc — чисто.

## Ключевые решения (кратко; подробно — в docs/adr)

- Один корневой `.env` для docker compose и Laravel (монтируется в контейнер как `backend/.env`).
- Сессии в PostgreSQL (`SESSION_DRIVER=database`), Redis — кеш, очереди, rate limiting.
- Пользователь создаётся при приглашении (`status=invited`); отзыв приглашения → `deactivated`,
  в админке такой пользователь помечен бейджем «Приглашение отозвано».
- Приглашения не удаляются никогда; scheduler чистит только просроченные `password_reset_tokens`.
- `event_log` — append-only (модель + триггер PostgreSQL). Тесты используют `RefreshDatabase`
  (транзакции), а не `DatabaseTruncation`: триггер запрещает TRUNCATE.
- Будущая `card_transitions` хранит снимок `board_id` и `from_category`/`to_category` (ADR-0003).
