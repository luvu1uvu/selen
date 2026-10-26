# Архитектура Selen

Документ описывает систему после этапа 2 «Карточка целиком»: пространства, доступ, доски, карточки и история
перемещений (этап 1); люди в карточке, поля, метки, режим «только свои карточки» (2a); описание и комментарии
на Tiptap, упоминания, чек-листы, ссылки, файлы (2b); связи, блокировки, лента истории и архив карточек (2c);
группы пользователей и итоговые права по источникам доступа (3a).
Решения и их причины — в [adr/](adr/).

## Компоненты

```
Браузер ──► nginx :8080 ──┬── /api/*, /sanctum/*, /up ──► php-fpm (Laravel 13) ──┬──► PostgreSQL 18
                          │                                                      ├──► Redis 8 (кеш, очереди, rate limit)
                          └── всё остальное ──► Vite dev server (SPA, HMR)        │
                                               (в prod — статика frontend/dist)   │
                                 queue worker (php artisan queue:listen) ◄────────┘──► SMTP / Mailpit
                                 scheduler   (php artisan schedule:work)
```

- **Один домен для SPA и API.** Поэтому аутентификация — cookie-сессии Sanctum без токенов и без CORS.
- **nginx** — единая точка входа; в dev проксирует SPA на Vite (с WebSocket для hot reload),
  в prod будет раздавать собранную статику (пример — `docker/nginx/prod.conf.example`; доводится к пилоту).
- **php-fpm, queue, scheduler** — один Docker-образ (`docker/php/Dockerfile`), разные команды.
- **Конфигурация** — единый корневой `.env` (шаблон `.env.example`): его читают и docker compose,
  и Laravel (смонтирован в контейнер как `backend/.env`).

## Backend (`backend/`)

Стандартная структура Laravel 13 плюс два слоя:

| Слой | Где | Что делает |
|---|---|---|
| Маршруты | `routes/api.php` | `/api/v1/...`, middleware `auth:sanctum`, `active`, `throttle:*` |
| Form Requests | `app/Http/Requests` | валидация входа, иногда авторизация (`authorize()`) |
| Controllers | `app/Http/Controllers/Api/V1` | тонкие: Request → Action → Resource; HTTP-специфика (сессия) |
| **Actions** | `app/Actions/{Auth,Invitations,Users,Spaces,Groups,CardTypes,Labels,Boards,Columns,Lanes,Cards,Comments,Checklists,CardLinks,Attachments,CardRelations,CardBlocks}` | бизнес-операция целиком, в транзакции, с записью события |
| Services | `app/Services` | переиспользуемое: `AccessResolver` + `SpaceAccess` + `CompanyAccess` (итоговые права по источникам доступа и правам каталога, права компании, изоляция компаний, ADR-0012, ADR-0024), `CompanyTemplate` (справочники новой компании), `EventRecorder`, `UserSessions`, `InvitationIssuer`, `Positioner`, `CardPlacement` (положение карточки, автоснятие блокировок), `CardFlowMetrics`, `CardVisibility` (кто видит карточку, «Скрытая карточка»), `CardPeople` (участники, автоназначение), `CardHistory` (лента истории), `MentionSync`, `AttachmentFiles` |
| Policies | `app/Policies` | кто может выполнять действие; доступ к пространствам — трейт `Policies/Concerns/ChecksSpaceRole` (ADR-0005) |
| Resources | `app/Http/Resources` | формат JSON-ответов |
| Models / Enums | `app/Models`, `app/Enums` | Eloquent-модели, роли, статусы, каталог событий |
| Notifications | `app/Notifications` | письма (через очередь, задача шифруется) |

### Поток запроса (пример: деактивация пользователя)

1. `POST /api/v1/admin/companies/{company}/users/{id}/deactivate` → nginx → php-fpm.
2. Middleware: Sanctum поднимает сессию из cookie → `auth:sanctum` → `active` (пользователь активен?).
3. `UserController::deactivate` → `Gate::authorize('deactivate', $user)` (`UserPolicy`).
4. `DeactivateUserAction::handle()` в транзакции: блокирует строку, проверяет «не последний админ»,
   меняет статус, удаляет сессии пользователя и перевыпускает `remember_token` (`UserSessions`),
   пишет `user.deactivated` в журнал (`EventRecorder`).
5. Ответ — `UserResource`.

### Данные (схема БД)

| Таблица | Ключевые поля |
|---|---|
| `companies` | `id` ULID, `name` (unique без учёта регистра), `created_by`, timestamps — компании (ADR-0024); не удаляются |
| `company_members` | `company_id`, `user_id` (PK пара), `kind` (`home`; гости — П2c), `is_admin` (администратор компании), timestamps — членство |
| `users` | `id` ULID, `name`, `email` (unique, lower-case), `password` (null до принятия приглашения), `role` owner/member (Владелец — один: уникальный частичный индекс, CHECK «активен», отложенный триггер, ADR-0017; администратор — у компании, ADR-0024), `status` invited/active/deactivated, `timezone` (Europe/Moscow), `last_login_at`, `deactivated_at`, `remember_token`, timestamps |
| `invitations` | `id` ULID, `company_id`, `user_id`, `email`, `token_hash` (sha256, unique), `invited_by_id`, `expires_at`, `accepted_at`, `revoked_at`, `superseded_by_id`, timestamps |
| `event_log` | `id` bigint identity, `company_id` (пусто — без компании), `occurred_at` timestamptz(6), `event_type`, `actor_id`, `subject_type`, `subject_id`, `payload` jsonb (только id и enum, без ПДн), `meta` jsonb (`source`) |
| `auth_audit` | `occurred_at`, `event_log_id`, `event_type`, `user_id`, `email_attempted`, `ip`, `user_agent` — НЕ append-only, хранится 12 мес. (ADR-0003) |
| `spaces` | `id` ULID, `company_id`, `name`, `key` (unique во всём Selen, `^[A-Z]{2,10}$`), `description`, `last_card_number`, `archived_at`, timestamps |
| `roles` | `id` ULID, `key` (стандартные: admin, editor, commenter, editor_own, commenter_own), `company_id` (у пользовательской роли), `name`, `card_scope` all/own, `grants_new_permissions`, `position` — роли: набор прав каталога и область карточек (ADR-0024) |
| `role_permissions` | `role_id`, `permission` (значение `App\Enums\Permission`; PK пара; роль с «управлением доступом» — только с областью all, триггер) |
| `access_grants` | `company_id`, `nav_node_id` (в П2a — узел пространства; узел и группа — той же компании, составные FK), `user_id` или `group_id` (ровно одно — CHECK), `role_id`, `granted_by`, timestamps — выдачи доступа; у субъекта на узле одна роль до П2d |
| `groups` | `id` ULID, `company_id`, `name` (unique в компании без учёта регистра), `description`, `system_key` (`everyone` — встроенная «Все сотрудники» компании, состав вычисляется), `archived_at` — группы пользователей (ADR-0012) |
| `group_members` | `group_id`, `user_id` (PK пара), `added_by`, `created_at` |
| `nav_nodes` | `id` ULID, `company_id` (родитель и пространство — той же компании), `parent_id` (null — корень дерева компании), `type` folder/space, `name` (у папки), `icon` (эмодзи), `space_id` (unique), `position` (COLLATE "C"), `archived_at` (у папки) — дерево навигации (ADR-0013) |
| `card_types` | `id` ULID, `company_id`, `name` (unique в компании), `color` `#rrggbb`, `is_default` (один на компанию), `archived_at` |
| `boards` | `id` ULID, `space_id`, `name`, `description`, `position` (COLLATE "C"), `auto_assign_on_move`, `archived_at` |
| `board_columns` | `id`, `board_id`, `parent_id` (неизменяем), `name`, `category` (только у первого уровня), `position`, `archived_at` |
| `lanes` | `id`, `board_id`, `name`, `position`, `archived_at` |
| `cards` | `id`, `space_id`, `number` (unique в пространстве), `board_id`, `column_id`, `lane_id`, `card_type_id`, `title`, `description` (jsonb, документ Tiptap), `position`, `created_by`, `customer_id` (заказчик), `responsible_id`, `due_date` или `due_at` (CHECK: не оба), `is_urgent`, `estimate_hours` (шаг 0,5), `first_started_at`, `completed_at`, `archived_at`, timestamps(6) |
| `card_participants` | `card_id`, `user_id` (PK пара), `added_by`, `created_at` |
| `labels` | `id`, `space_id` (null — общая метка компании), `name` (unique среди активных набора, без учёта регистра), `color`, `archived_at` |
| `card_labels` | `card_id`, `label_id` (PK пара) |
| `comments` | `id`, `card_id`, `author_id`, `body` jsonb (документ Tiptap; null у удалённого), `edited_at`, `deleted_at`, timestamps |
| `mentions` | `card_id`, `user_id`, `source_type` card/comment, `source_id`, `mentioned_by`, `created_at` — кто где упомянут (уведомления этапа 4) |
| `checklists`, `checklist_items` | чек-лист карточки (`title`, `position`) и его пункты (`text`, `is_done`, `done_at`, `done_by`, `position`) |
| `card_links` | `card_id`, `url` (http/https), `title`, `created_by` |
| `attachments` | `id`, `card_id`, `uploaded_by`, `disk`, `path` (`{card_id}/{ulid}`; `''` — файл стёрт по сроку), `name`, `mime` (по содержимому), `size`, `kind` image/video/file, `deleted_at`, `deleted_by` (ADR-0010) |
| `card_relations` | `id`, `parent_id`, `child_id` (unique пара, CHECK ≠), `created_by`, `created_at` — родитель и дочерняя в одном пространстве, без циклов |
| `card_blocks` | `id`, `card_id`, `blocking_card_id`, `reason` (хотя бы одно из двух), `started_at`, `started_by`, `ended_at`, `ended_by`, `end_reason` manual/blocker_completed — эпизоды блокировки; триггер разрешает только закрыть эпизод (ADR-0011) |
| `card_transitions` | append-only история положения карточки со снимком категории (ADR-0006) |
| `sessions` | стандартная таблица Laravel, `user_id` ULID — сессии хранятся в БД |
| `password_reset_tokens`, `cache`, `jobs`, `failed_jobs`, `job_batches` | стандартные таблицы Laravel |

Все `timestamp` — `timestamptz` в UTC. Роль и статус защищены CHECK-ограничениями.

### Аутентификация и сессии

- SPA получает CSRF-cookie (`GET /sanctum/csrf-cookie`), затем `POST /api/v1/auth/login`.
- Сессии — в PostgreSQL, поэтому их можно завершить по пользователю: при деактивации (все),
  при сбросе пароля (все), при смене пароля (все, кроме текущей).
- «Запомнить меня» — стандартная cookie Laravel на 30 дней; аннулируется сменой `remember_token`.
- Middleware `active` — второй рубеж: неактивного пользователя с уцелевшей сессией выкидывает с 401.
- Rate limiting (`AppServiceProvider`): вход 5/мин на email+IP и 20/мин на IP; сброс пароля 3/мин на email
  и 10/мин на IP; смена пароля 6/мин; страница приглашения 20/мин на IP.

### Пространства и доступ

Подробно — [adr/0005-space-access.md](adr/0005-space-access.md). Кратко: роли admin/editor/commenter на уровне
пространства; не участник получает 404 (единый ответ для всего API), нехватка роли — 403; администратор компании
управляет пространствами из админки, но содержимое видит только назначив себе роль.
Владелец ([adr/0017-owner-role.md](adr/0017-owner-role.md)) — один на весь Selen, участник всех компаний, назначает
и снимает администраторов компаний, передаёт владение; его учётную запись не меняет никто.
Матрица доступа в тестах покрывает каждый маршрут пространства.

**Компании** ([adr/0024-rights-2.md](adr/0024-rights-2.md), П2b-1): у каждой свои дерево, группы со своей «Все
сотрудники», метки, типы карточек, приглашения и журнал; человек связан с компанией членством (`company_members`:
«дом», администратор компании). Изоляция — в `AccessResolver`: выдача действует, только если получатель — участник
компании выдачи («дом» или Владелец). Админка — `admin/companies/{company}/…` со scoped binding (объект другой
компании — 404), права компании — `Company::permissionsOf()`; справочники и ссылки в запросах — «в этой компании»;
связи между компаниями запрещены в БД (составные FK, триггеры). Всё, что было до компаний, — «Компания 1»; пока
компания одна, интерфейс прежний. Тесты — `CompanyIsolationTest`, `AdminAccessMatrixTest` по компаниям.

Режим «только свои карточки» ([adr/0008-own-cards-only.md](adr/0008-own-cards-only.md)) — область карточек роли
(«Редактор / Комментатор — только свои карточки»): участник видит только карточки, где он заказчик, ответственный или участник; остальные — 404
везде, включая доску и счётчики колонок. Единая точка правила — `CardVisibility`.

**Группы пользователей** ([adr/0012-groups.md](adr/0012-groups.md)): у человека несколько источников доступа —
личная выдача и выдачи группам (роль на всю группу). Действие разрешено, если его целиком разрешает хотя бы один
источник. **Каталог прав и роли** ([adr/0024-rights-2.md](adr/0024-rights-2.md)): роль — набор прав
`App\Enums\Permission` и область карточек (все / свои); стандартные роли — «Администратор», «Редактор»,
«Комментатор» и два варианта «— только свои карточки»; политики проверяют права каталога. Выдачи и права ролей читает
только `AccessResolver` (один запрос `UNION ALL`), права кешируются на экземпляре `Space` (`accessOf`). В пространстве всегда есть личный администратор; администраторы через
группы — дополнительные. Группы ведёт администратор компании; архивная группа доступа не даёт. Встроенная группа
«Все сотрудники» — все активные «дома» компании (состав вычисляется резолвером, не хранится; без роли admin).

**Дерево навигации** ([adr/0013-navigation-tree.md](adr/0013-navigation-tree.md)): папки и пространства в
`nav_nodes`, глубина папок ≤ 4, у каждой компании своё дерево, ведёт администратор компании (админка «Структура»).
Папки не дают доступа:
`NavigationTree::forUser` показывает папку, только если внутри есть доступное пользователю активное пространство,
названия прочих папок и чужих компаний не уходят в ответы (правило одно для всех, включая администратора компании; полная
структура — только в «Структуре»); каждое доступное пространство видно всегда, даже без досок. Владельцу
видны ещё и пустые папки (без единого пространства), с пометкой «пустая» (ADR-0017). Перемещение
меняет только место в дереве — ключ, номера, история и доступы не трогаются.

### Доски, карточки и метрики

- Доска создаётся из шаблона (enum `BoardTemplate`); колонки — два уровня, карточки только в листовых.
- Порядок — дробные ключи; клиент присылает соседей, сервер вычисляет позицию (ADR-0007).
- Номер карточки `DEV-n` — счётчик `spaces.last_card_number` (`UPDATE ... RETURNING` под блокировкой строки).
- Любое изменение положения карточки проходит через `CardPlacement`: переход в `card_transitions`,
  пересчёт `first_started_at`/`completed_at`, событие `card.moved` — в одной транзакции (ADR-0006).
- `CardFlowMetrics` считает lead/cycle time только по истории переходов.
- Люди в карточке: заказчик (по умолчанию автор), ответственный, участники. Автоназначение (настройка доски):
  после ручного перехода в «в работе»/«готово» переместивший становится ответственным, а если он уже есть —
  участником (`CardPeople`).
- Метки — общие компании (администратор компании) и пространства (его администратор), архив вместо удаления.
- Фасад карточки на доске: метки, срок с подсветкой, «Срочно», ответственный; справочники меток и людей
  приходят один раз на доску, число SQL-запросов не зависит от числа карточек (тест).

### Содержимое карточки (2b)

- **Описание и комментарии** — документ Tiptap в JSON (ADR-0009). Сервер проверяет его по белому списку
  (`RichTextDocument`) и контексту (`Rules\RichText`: упомянуть можно только того, кто видит карточку,
  картинка — только вложение этой карточки). Упоминания — в `mentions` через `MentionSync`.
- **Комментарии**: правит и удаляет только автор; удаление мягкое — текст стирается, строка остаётся.
- **Файлы** (ADR-0010): диск `attachments` вне `public`; отдача через `AttachmentFiles` — X-Accel-Redirect
  в nginx (Range) или временная ссылка S3; inline — только картинки и видео из белого списка, остальное
  скачиванием. Удаление мягкое, файл стирает `model:prune` через 30 дней. Лимит 100 МБ.
- Все сущности карточки проверяют доступ через карточку (`allowCard`) — режим «только свои карточки»
  действует на них без отдельного кода (ADR-0008).
- Фасад на доске: прогресс чек-листов, счётчики комментариев и файлов — агрегаты в запросе доски.

### Связи, блокировки, история и архив (2c)

- **Связи** «родитель — дочерняя» (`card_relations`): несколько родителей, только внутри пространства, цикл
  проверяется рекурсивным CTE. У родителя — прогресс дочерних (готовые из активных).
- **Блокировки** (`card_blocks`, ADR-0011): несколько одновременно, причина — текст и/или карточка. Эпизод
  только закрывается (триггер). Когда блокирующая карточка входит в «готово», `CardPlacement` закрывает её
  блокировки в той же транзакции (`blocker_completed`). На фасаде — `is_blocked` (`withExists`).
- **Связанная карточка глазами зрителя** — `CardVisibility::present()`: номер и название или `{hidden: true}`
  («Скрытая карточка»). Связать или заблокировать можно только видимой карточкой.
- **Лента истории** `GET cards/{card}/history` (`CardHistory`): переходы + события журнала по карточке, новые
  сверху, со справочниками для подписей (журнал хранит только id); id скрытых карточек заменяются на `hidden`.
  Прежний `GET …/transitions` сохранён.
- **Архив доски** `GET boards/{id}/archived-cards` (editor+) и **поиск** `GET spaces/{KEY}/cards` (выбор связи
  и блокирующей карточки) — по номеру или названию, через `CardVisibility::scope`.

### Журнал событий

Append-only таблица `event_log` — фундамент для метрик (подробно: [adr/0003-event-log.md](adr/0003-event-log.md)).
Запись — только через `EventRecorder` внутри транзакции доменного изменения. Изменение/удаление запрещено
моделью (исключение) и триггером PostgreSQL (UPDATE/DELETE/TRUNCATE). Персональных данных в журнале нет;
IP и user agent входов — в `auth_audit` с автоочисткой через 12 месяцев (`model:prune` в scheduler).

## Frontend (`frontend/`)

- `src/app/` — `routes.tsx` (карта маршрутов), `guards.tsx` (RequireAuth/RequireGuest/RequireAdmin),
  layout'ы, `queryClient.ts` (глобальная реакция на 401 → на страницу входа).
- `src/features/<фича>/` — `api.ts` (запросы), `queries.ts` (хуки TanStack Query), страницы, компоненты, тесты.
- `src/shared/` — HTTP-клиент (axios с XSRF), i18n (все строки), UI-kit (shadcn/ui), типы API.

Маршруты SPA: `/login`, `/forgot-password`, `/reset-password/:token`, `/invitations/:token`, `/` (пространства),
`/spaces/:key`, `/boards/:id`, `/cards/:key` (доска + панель карточки), `/profile`; админка — `/admin/companies`
(«Компании», только Владелец) и админка компании `/admin/c/:companyId/…` (ADR-0024): `users`, `groups`, `invitations`
(вкладки раздела «Пользователи»), `users/:id` (доступ пользователя по источникам), `groups/:id`, `spaces`,
`structure` (дерево навигации), `card-types`, `labels`, `trash`, `events`; прежние адреса `/admin/<раздел>` ведут
в компанию по умолчанию (последняя выбранная или первая). Ссылки в письмах строит backend по
`config/selen.php → frontend_paths`.

Проверки прав на клиенте — только для удобства (скрыть меню); реальный доступ проверяет API.

- **Ленивая загрузка:** доска с карточкой, страница пространства и страницы админки — отдельные чанки
  (React Router `lazy`); основной бандл ~340 КБ.
- **Редактор:** `shared/components/rich-text/*` (Tiptap) не знает о карточке — упоминаемых, загрузку картинок
  и имена передаёт вызывающий код (`features/cards/components/RichText.tsx`); пригодится модулю документов.
- **Навигация:** слева полоса разделов («Дерево», «Администрирование»), рядом панель раздела. Дерево —
  `features/navigation` (`GET /navigation`, поиск на клиенте — чистые функции `tree.ts`; раскрытые узлы и
  свёрнутость панели — `usePersistentState`, localStorage с try/catch).
- **Доска:** раскладка и группировка — чистые функции `features/boards/model.ts`; логика перетаскивания —
  хук `useBoardDnd` (dnd-kit); оптимистичное перемещение с откатом — `useCardMove`.

## Тесты

| Уровень | Где | Что |
|---|---|---|
| Backend | `backend/tests/Feature`, `tests/Unit` (Pest, реальный PostgreSQL) | API, права (матрица доступа — лично и через группы), метрики, сквозные сценарии этапов |
| Frontend | `frontend/src/**/*.test.tsx` (Vitest, MSW) | страницы и компоненты, логика доски; порог покрытия строк 77 % |
| E2E | `e2e/tests` (Playwright), стек `docker-compose.e2e.yml` | вход, перетаскивание карточки, «не найдено» без доступа, режим «только свои карточки», файлы через nginx (Range, `.mov`), блокировка с автоснятием, лента истории, архив, доступ через группу появляется и исчезает, дерево (папка видна/не видна, поиск, перенос в «Структуре») — на production-сборке |
| Производительность | `make perf` (Playwright, production-сборка, доска на 300 карточек) | появление дерева, открытие доски и перетаскивание, CPU ×1 и ×4 — замеры этапов в `docs/stages/stage-2.md`, `stage-3.md` |

## Задел на будущее

Порядок и состав этапов — [дорожная карта](roadmap.md).

- **Отчёты (этап 9):** строятся по `card_transitions` (ADR-0006) и `card_blocks` (время разрешения блокировок, ADR-0011).
- **Документы в дереве (этап 8):** новый `nav_nodes.type = document` со своей ссылкой; видимость папки — по тому же
  правилу «внутри есть доступный элемент» (ADR-0013). Новые источники доступа — только в `AccessResolver`.
- **Realtime и уведомления (этап 4):** Laravel Reverb (стандарт Laravel); упоминания уже хранятся в `mentions`.
- **Деплой:** один VPS, тот же набор сервисов; prod-конфиг nginx и инструкция — к пилоту.
