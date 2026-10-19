# Selen — команды разработчика. Список: make help
# Все команды выполняются внутри Docker-контейнеров; локально нужны только docker и make.

SHELL := /bin/bash
.DEFAULT_GOAL := help

export HOST_UID := $(shell id -u)
export HOST_GID := $(shell id -g)

DC       := docker compose
PHP      := $(DC) exec -T php
ARTISAN  := $(PHP) php artisan
NODE_RUN := $(DC) run --rm --no-deps -T node

.PHONY: help
help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Окружение
# ---------------------------------------------------------------------------

.PHONY: up
up: .env ## Собрать и запустить всё окружение (первый запуск тоже)
	$(DC) build php
	@test -d backend/vendor || $(DC) run --rm --no-deps -T php composer install --no-interaction
	@test -d frontend/node_modules || $(NODE_RUN) npm ci --no-audit --no-fund
	@grep -qE '^APP_KEY=.+' .env || $(MAKE) --no-print-directory key
	$(DC) up -d --wait postgres redis
	$(DC) up -d
	@echo ""
	@echo "Selen:   http://localhost:$$(grep -E '^APP_PORT=' .env | cut -d= -f2)"
	@echo "Mailpit: http://localhost:$$(grep -E '^MAILPIT_UI_PORT=' .env | cut -d= -f2)"
	@echo "Если база пустая — выполните: make fresh"

.env:
	cp .env.example .env
	@echo "Создан .env из .env.example"

.PHONY: key
key: ## Сгенерировать APP_KEY и записать в .env
	@KEY=$$($(DC) run --rm --no-deps -T php php -r 'echo "base64:".base64_encode(random_bytes(32));') && \
		sed -i.bak "s|^APP_KEY=.*|APP_KEY=$$KEY|" .env && rm -f .env.bak && echo "APP_KEY записан в .env"

.PHONY: down
down: ## Остановить окружение (данные сохраняются)
	$(DC) down

.PHONY: destroy
destroy: ## Остановить окружение и УДАЛИТЬ данные БД и Redis
	$(DC) down -v

.PHONY: restart
restart: ## Перезапустить контейнеры (например, после правки .env)
	$(DC) up -d --force-recreate

.PHONY: logs
logs: ## Логи всех сервисов (Ctrl+C — выход)
	$(DC) logs -f --tail=100

.PHONY: shell
shell: ## Shell в контейнере php
	$(DC) exec php sh

.PHONY: install
install: ## Переустановить зависимости composer и npm
	$(DC) run --rm --no-deps -T php composer install --no-interaction
	$(NODE_RUN) npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# База данных
# ---------------------------------------------------------------------------

.PHONY: fresh
fresh: ## Пересоздать БД с нуля: миграции + сиды (ВСЕ ДАННЫЕ И ФАЙЛЫ ВЛОЖЕНИЙ УДАЛЯЮТСЯ)
	$(ARTISAN) migrate:fresh --force --database=pgsql_owner
	$(PHP) find storage/app/private/attachments -mindepth 1 ! -name .gitignore -delete
	$(ARTISAN) db:seed --force

# Миграции — только под владельцем схемы (docs/adr/0016-db-roles.md): у роли приложения нет прав на DDL
.PHONY: migrate
migrate: ## Применить новые миграции
	$(ARTISAN) migrate --database=pgsql_owner

.PHONY: db-roles
db-roles: ## Перевести базу на роли selen_owner / selen_app (один раз для старого тома; повтор безопасен)
	./scripts/db-roles.sh
	$(DC) up -d --force-recreate

.PHONY: admin
admin: ## Создать администратора (интерактивно)
	$(DC) exec php php artisan app:create-admin

.PHONY: metrics
metrics: ## Сводка lead/cycle time по доскам: make metrics SPACE=DEV DAYS=60
	@test -n "$(SPACE)" || (echo "Укажите пространство: make metrics SPACE=DEV [DAYS=60]" && exit 1)
	$(ARTISAN) app:flow-metrics $(SPACE) --days=$(or $(DAYS),30)

# ---------------------------------------------------------------------------
# Качество
# ---------------------------------------------------------------------------

.PHONY: test
test: test-backend test-frontend ## Все тесты

.PHONY: test-backend
test-backend: ## Тесты backend (Pest)
	$(ARTISAN) config:clear --quiet
	$(PHP) php -d pcov.enabled=1 vendor/bin/pest --coverage --min=80

.PHONY: test-frontend
test-frontend: ## Тесты frontend (Vitest)
	$(NODE_RUN) npm run test:coverage

.PHONY: lint
lint: ## Все линтеры и проверка типов (без изменений файлов)
	./scripts/check-scripts.sh
	$(PHP) vendor/bin/pint --test
	$(PHP) vendor/bin/phpstan analyse --memory-limit=1G --no-progress
	$(NODE_RUN) npm run lint
	$(NODE_RUN) npm run format:check
	$(NODE_RUN) npm run typecheck

.PHONY: fix
fix: ## Автоисправление стиля (Pint, ESLint --fix, Prettier)
	$(PHP) vendor/bin/pint
	$(NODE_RUN) npm run lint:fix
	$(NODE_RUN) npm run format

.PHONY: audit-deps
audit-deps: ## Уязвимости зависимостей: composer и npm (frontend, e2e), падает на high/critical — как CI «Security»
	./scripts/deps-audit.sh

# ---------------------------------------------------------------------------
# E2E-тесты в браузере (Playwright) — изолированный стек docker-compose.e2e.yml
# ---------------------------------------------------------------------------

.PHONY: e2e
e2e: ## E2E-тесты в браузере на отдельной базе (dev-данные не трогаются)
	./scripts/e2e.sh

.PHONY: e2e-tc
e2e-tc: ## Приёмочные автотесты тест-кейсов: make e2e-tc TC=3.8 (несколько — через запятую)
	@test -n "$(TC)" || (echo "Укажите тест-кейсы: make e2e-tc TC=3.8,3.9" && exit 1)
	TC="$(TC)" ./scripts/e2e.sh

.PHONY: e2e-stage
e2e-stage: ## Все приёмочные автотесты этапа: make e2e-stage STAGE=3 (e2e/acceptance/stage-3)
	@test -n "$(STAGE)" || (echo "Укажите этап: make e2e-stage STAGE=3" && exit 1)
	@test -d "e2e/acceptance/stage-$(STAGE)" || (echo "Приёмочных автотестов этапа $(STAGE) пока нет (e2e/acceptance/stage-$(STAGE))" && exit 1)
	./scripts/e2e.sh "acceptance/stage-$(STAGE)/"

.PHONY: perf
perf: ## Замер производительности доски на 300 карточек (production-сборка, демо-данные)
	./scripts/perf.sh

.PHONY: e2e-down
e2e-down: ## Остановить E2E-стек (если make e2e прервали)
	docker compose -f docker-compose.e2e.yml down -v --remove-orphans

# ---------------------------------------------------------------------------
# Бэкапы (см. docs/runbook.md)
# ---------------------------------------------------------------------------

.PHONY: backup
backup: ## Создать бэкап БД и файлов с ротацией (7 ежедневных, 4 еженедельных)
	./scripts/backup.sh

.PHONY: restore
restore: ## Восстановить БД из бэкапа: make restore FILE=backups/daily/....dump
	@test -n "$(FILE)" || (echo "Укажите файл: make restore FILE=backups/daily/<имя>.dump" && exit 1)
	./scripts/restore.sh "$(FILE)"

.PHONY: backup-verify
backup-verify: ## Проверить бэкап: бэкап → удаление данных → восстановление → сверка
	./scripts/backup-verify.sh

# ---------------------------------------------------------------------------
# Стенд PM — постоянная копия Selen на коде main (docs/runbook.md, «Стенд PM»)
# Команды выполняет scripts/pm.sh ИЗ РАБОЧЕЙ КОПИИ СТЕНДА (main), а не из текущей ветки.
# ---------------------------------------------------------------------------

PM_DIR      ?= $(HOME)/dev/selen-pm
PM_BRANCH   ?= pm-stand
PM_UPSTREAM ?= origin/main
PM_SH       := $(PM_DIR)/scripts/pm.sh
# Путь из FILE=: zsh не раскрывает ~ после «=» (FILE=~/Desktop/bug.json) — раскрываем сами, затем абсолютный путь
pm_path      = $(if $(1),$(abspath $(patsubst ~/%,$(HOME)/%,$(1))))

.PHONY: pm-worktree
pm-worktree:
	@test -d "$(PM_DIR)" || { git fetch -q origin && \
		git worktree add -q --track -b "$(PM_BRANCH)" "$(PM_DIR)" "$(PM_UPSTREAM)" && \
		echo "Рабочая копия стенда: $(PM_DIR) (ветка $(PM_BRANCH) = $(PM_UPSTREAM))"; }
	@test -x "$(PM_SH)" || { echo "В $(PM_DIR) нет scripts/pm.sh — это не рабочая копия стенда" >&2; exit 1; }

.PHONY: pm-up pm-down pm-owner pm-update pm-backup pm-restore pm-restore-check pm-backlog pm-qa-bot pm-bug \
	pm-bug-move pm-bug-show pm-bugs-list pm-bug-comment pm-task pm-owner-show pm-transfer-ownership
pm-up: pm-worktree ## Стенд PM: первый запуск (рабочая копия, секреты, сборка, миграции) или запуск — http://127.0.0.1:8081
	@"$(PM_SH)" up

pm-down: pm-worktree ## Стенд PM: остановить (данные сохраняются)
	@"$(PM_SH)" down

pm-owner: pm-worktree ## Стенд PM: создать учётную запись PM (интерактивно; первая на стенде — Владелец)
	@"$(PM_SH)" owner

pm-owner-show: pm-worktree ## Стенд PM: кто Владелец и с какого момента
	@"$(PM_SH)" owner-show

pm-transfer-ownership: pm-worktree ## Стенд PM: аварийно передать роль Владельца: make pm-transfer-ownership EMAIL=you@example.com
	@"$(PM_SH)" transfer-ownership "$(EMAIL)"

pm-update: pm-worktree ## Стенд PM: бэкап → код до свежего main (fast-forward) → сборка → migrate → перезапуск
	@"$(PM_SH)" update

pm-backup: pm-worktree ## Стенд PM: бэкап базы и файлов (~/dev/selen-pm-backups)
	@"$(PM_SH)" backup

pm-restore: pm-worktree ## Стенд PM: восстановить из бэкапа: make pm-restore FILE=путь/к/бэкапу.dump
	@"$(PM_SH)" restore "$(call pm_path,$(FILE))"

pm-restore-check: pm-worktree ## Стенд PM: свежий бэкап → восстановление во временный проект → сверка (FROM=local|offsite)
	@"$(PM_SH)" restore-check "$(FROM)"

pm-backlog: pm-worktree ## Стенд PM: пространство LATER и отложенные задачи: make pm-backlog OWNER=you@example.com
	@"$(PM_SH)" backlog "$(OWNER)"

pm-qa-bot: pm-worktree ## Стенд PM: учётная запись QA-бота (editor в LATER)
	@"$(PM_SH)" qa-bot

pm-bug: pm-worktree ## Стенд PM: баг от QA-бота на доске «Баги приёмки»: make pm-bug FILE=путь/к/bug.json
	@"$(PM_SH)" bug "$(call pm_path,$(FILE))"

pm-bug-move: pm-worktree ## Стенд PM: перевести карточку LATER: make pm-bug-move KEY=LATER-12 TO=Исправлено
	@"$(PM_SH)" bug-move "$(or $(KEY),$(ID))" "$(TO)"

pm-bug-show: pm-worktree ## Стенд PM: карточка целиком, вложения — в .pm-bugs/: make pm-bug-show KEY=LATER-12
	@"$(PM_SH)" bug-show "$(KEY)" "$(CURDIR)/.pm-bugs"

pm-task: pm-worktree ## Стенд PM: карточка работы на «Бэклоге» («Взято в работу»): make pm-task FILE=путь/к/task.json
	@"$(PM_SH)" task "$(call pm_path,$(FILE))"

pm-bugs-list: pm-worktree ## Стенд PM: баги в колонке «Новый» (другая колонка — COLUMN=Исправляется)
	@"$(PM_SH)" bugs-list "$(COLUMN)"

# TEXT берём из окружения (make экспортирует переменные командной строки): кавычки в тексте не ломают команду
pm-bug-comment: pm-worktree ## Стенд PM: комментарий QA-бота: make pm-bug-comment KEY=LATER-12 TEXT="…" (или FILE=…)
	@"$(PM_SH)" bug-comment "$(KEY)" "$$TEXT" "$(call pm_path,$(FILE))"

# ---------------------------------------------------------------------------
# Mac mini как хост (docs/runbook.md, «Mac mini как хост»; ADR-0018): агенты launchd — бэкап стенда каждый час
# с копией в облако и сервер Remote Control. scripts/host.sh — из рабочей копии стенда (код main), как pm.sh.
# ---------------------------------------------------------------------------

HOST_SH := $(PM_DIR)/scripts/host.sh

.PHONY: host-install host-status host-uninstall
host-install: pm-worktree ## Mac mini: агенты launchd — бэкап стенда каждый час и Remote Control (AGENT=backup|remote-control)
	@SELEN_MAIN_DIR="$(CURDIR)" "$(HOST_SH)" install "$(or $(AGENT),all)"

host-status: pm-worktree ## Mac mini: что работает, последний бэкап и копия в облаке, строки ВНИМАНИЕ
	@"$(HOST_SH)" status

host-uninstall: pm-worktree ## Mac mini: снять агенты launchd (AGENT=backup|remote-control)
	@"$(HOST_SH)" uninstall "$(or $(AGENT),all)"
