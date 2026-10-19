# ADR-0001. Стек и версии, dev-окружение

- **Статус:** принят
- **Дата:** 2026-10-12

## Контекст

Продукт внутренний, сопровождать его будет PM с Claude Code при поддержке штатных разработчиков
Laravel/React. Нужны максимально конвенциональные, хорошо документированные технологии с долгой
поддержкой. Промт задал стек; версии нужно было проверить на актуальность на октябрь 2026.

## Решение

| Компонент | Версия (на момент установки) | Комментарий |
|---|---|---|
| PHP | 8.4 (образ `php:8.4-fpm-alpine`, 8.4.26) | Laravel 13 поддерживает 8.3–8.5. Взята 8.4: самая широкая совместимость расширений и образов, поддержка безопасности до конца 2028. Переход на 8.5 — отдельной задачей |
| Laravel | 13.x (13.35) | актуальный мажор |
| Laravel Sanctum | 4.3 | |
| PostgreSQL | 18 (`postgres:18-alpine`) | промт требует 16+; 18 — актуальная стабильная |
| Redis | 8 (`redis:8-alpine`) | кеш, очереди, rate limiting. Лицензия Redis 8 (AGPLv3 / RSAL / SSPL) допускает внутреннее использование; при желании заменяется на Valkey без изменений кода |
| Node (контейнер) | 24 LTS | LTS-линия; локально у разработчика может быть любая |
| React / TypeScript / Vite | 19.2 / 6.0 / 8.3 | шаблон create-vite по умолчанию |
| React Router | 8.x, **data mode** (`createBrowserRouter`) | framework mode не используем — это SPA, SSR не нужен |
| TanStack Query | 5 | |
| Tailwind CSS | 4 (через `@tailwindcss/vite`) | |
| UI-компоненты | shadcn/ui (Radix + Tailwind), исходники в `src/shared/ui` | де-факто стандарт; код в репозитории, нет зависимости от чужой библиотеки компонентов |
| Формы | react-hook-form + zod 4 | |
| HTTP | axios | сам передаёт XSRF-cookie Sanctum (`withXSRFToken`) |
| i18n | i18next + react-i18next | ru по умолчанию |
| Тесты backend | Pest 5 + pest-plugin-laravel, реальный PostgreSQL | JSONB и триггеры не проверить на sqlite |
| Тесты frontend | Vitest 5 + Testing Library + MSW 3 + jsdom | |
| Качество | Pint (preset laravel), Larastan 3 level 6, ESLint 10 (flat) + typescript-eslint, Prettier 3 | |
| Локализация backend | `laravel-lang/common` (dev) | готовые русские сообщения валидации |

**Отклонения от промта и шаблонов:**

- create-vite в 2026 по умолчанию ставит oxlint — заменён на ESLint + Prettier, как требует промт.
- Скелет Laravel 13 кладёт в `backend/` файлы `AGENTS.md`/`CLAUDE.md` с инструкциями установить Laravel Boost.
  Удалены: правила проекта — в корневом `CLAUDE.md`. Laravel Boost (официальный MCP-сервер Laravel для
  AI-агентов) можно подключить позже отдельным решением.
- Проверку паролей по базам утечек (`Password::uncompromised()`) не включаем: она обращается к внешнему
  сервису (HIBP), что противоречит цели независимости от внешних SaaS и может быть недоступно из РФ.
- `pest --parallel` не используется: в текущих версиях pest 5.3 и paratest несовместимы. Набор тестов
  проходит в один поток за ~4–5 с.

### Dev-окружение

Docker Compose: `nginx`, `php` (fpm), `queue`, `scheduler`, `node` (Vite), `postgres`, `redis`, `mailpit`.
Команды — через `Makefile`. Один корневой `.env` для docker compose и Laravel.

На машине PM Docker установлен через **Colima** (open source, бесплатно для компаний; ставится через
Homebrew). Docker Desktop бесплатен только для компаний < 250 сотрудников и < $10M выручки,
OrbStack требует платной лицензии для коммерческого использования. Проект от выбора не зависит.

## Последствия

- Обновления мажорных версий — отдельными задачами с проверкой `make lint && make test`.
- Версии зафиксированы lock-файлами (`composer.lock`, `package-lock.json`) и тегами образов.
