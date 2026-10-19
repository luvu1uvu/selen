<?php

namespace App\Console\Commands;

use App\Actions\Users\TransferOwnershipAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Validation\ValidationException;

use function Laravel\Prompts\confirm;

/**
 * Аварийная передача владения (ADR-0017): только на сервере, если Владелец недоступен (уволился, потерял
 * доступ). Назначает Владельца и там, где его нет. Бывший Владелец становится администратором; событие —
 * в журнале без автора, с via: console. Стенд PM: make pm-transfer-ownership EMAIL=…
 *
 *   php artisan app:transfer-ownership new-owner@example.com            — с подтверждением
 *   php artisan app:transfer-ownership new-owner@example.com --force    — без вопросов (скрипты)
 */
#[Signature('app:transfer-ownership {email : Email нового Владельца — активного сотрудника} {--force : Не спрашивать подтверждение}')]
#[Description('Аварийно передать роль Владельца другому сотруднику')]
class TransferOwnershipCommand extends Command
{
    use ReportsStandErrors;

    public function handle(TransferOwnershipAction $action): int
    {
        return $this->reportingErrors(function () use ($action) {
            $email = mb_strtolower(trim((string) $this->argument('email')));
            $to = User::query()->where('email', $email)->first()
                ?? throw ValidationException::withMessages(['email' => "Нет пользователя с email {$email}."]);
            $from = User::query()->where('role', UserRole::Owner)->first();

            $this->line('Сейчас Владелец: '.($from === null ? 'не назначен' : self::describe($from)));
            $this->line('Новый Владелец:  '.self::describe($to));

            if (! $this->option('force') && ! confirm('Передать владение?', default: false)) {
                $this->components->warn('Отменено: владение не передано.');

                return self::FAILURE;
            }

            $owner = $action->handle(null, $to, 'console');

            $this->components->info('Владелец теперь '.self::describe($owner)
                .($from === null ? '.' : "; {$from->email} — администратор."));

            return self::SUCCESS;
        });
    }

    private static function describe(User $user): string
    {
        return "{$user->name} <{$user->email}> ({$user->role->value}, {$user->status->value})";
    }
}
