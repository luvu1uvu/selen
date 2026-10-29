<?php

use App\Models\Attachment;
use App\Models\AuthAuditEntry;
use App\Models\EmailChangeRequest;
use Illuminate\Support\Facades\Schedule;

// Удаление просроченных токенов сброса пароля.
// Приглашения НЕ удаляются никогда: просроченные остаются в истории со статусом «истекло».
Schedule::command('auth:clear-resets')->everyFifteenMinutes();

// Удаление записей auth_audit (IP, user agent) старше срока хранения — config selen.auth_audit.
// Журнал событий (event_log) не очищается никогда: в нём нет персональных данных.
Schedule::command('model:prune', ['--model' => [AuthAuditEntry::class]])->dailyAt('03:30');

// Просроченные запросы смены email (новый адрес — ПДн, хранится только пока ждёт подтверждения; П2c-2)
Schedule::command('model:prune', ['--model' => [EmailChangeRequest::class]])->dailyAt('03:35');

// Упавшие задачи очереди (в них — адреса и имена из писем, хоть и зашифрованные) — не дольше 30 дней (аудит П2c-2, S-3)
Schedule::command('queue:prune-failed', ['--hours' => 24 * 30])->dailyAt('03:45');

// Файлы удалённых вложений стираются через Attachment::PURGE_AFTER_DAYS (строка остаётся) — ADR-0010
Schedule::command('model:prune', ['--model' => [Attachment::class]])->dailyAt('03:40');

// Режим «одна компания», а компаний в базе несколько — предупреждение в лог (ADR-0026)
Schedule::command('app:company-mode')->dailyAt('03:50');
