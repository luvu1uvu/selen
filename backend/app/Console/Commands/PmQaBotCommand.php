<?php

namespace App\Console\Commands;

use App\Actions\PmStand\SetUpQaBotAction;
use App\Console\Commands\Concerns\ReportsStandErrors;
use App\Services\PmStand\PmStand;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Стенд PM (make pm-qa-bot): учётная запись «QA-бот» — editor в LATER. Пароль берётся из переменной окружения
 * QA_BOT_PASSWORD (её передаёт scripts/pm.sh из .env стенда), чтобы он не попадал в командную строку.
 */
#[Signature('pm:qa-bot {owner : Email PM — администратора LATER} {email : Email QA-бота}')]
#[Description('Стенд PM: учётная запись QA-бота (editor в LATER), пароль — из QA_BOT_PASSWORD')]
class PmQaBotCommand extends Command
{
    use ReportsStandErrors;

    public function handle(SetUpQaBotAction $action): int
    {
        return $this->reportingErrors(function () use ($action) {
            $data = Validator::make([
                'email' => mb_strtolower(trim((string) $this->argument('email'))),
                'password' => (string) getenv('QA_BOT_PASSWORD'),
            ], [
                'email' => ['required', 'email', 'max:255'],
                'password' => ['required', 'string', Password::defaults()],
            ], [
                'password.required' => 'Не задан пароль QA-бота (переменная окружения QA_BOT_PASSWORD).',
            ])->validate();

            $owner = PmStand::requireUser((string) $this->argument('owner'), PmStand::OWNER_HINT);
            $space = PmStand::requireSpace();
            Gate::forUser($owner)->authorize('manageMembers', $space);

            $bot = $action->handle($owner, $space, $data['email'], $data['password']);

            $this->components->info("QA-бот {$bot->email} готов: editor в {$space->key}.");

            return self::SUCCESS;
        });
    }
}
