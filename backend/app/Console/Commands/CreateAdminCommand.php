<?php

namespace App\Console\Commands;

use App\Actions\Users\CreateAdminAction;
use App\Models\Company;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

/**
 * Создание администратора. Нужна для первого входа в систему на новом сервере: первый созданный администратор
 * становится Владельцем (если Владельца ещё нет, ADR-0017).
 *
 *   php artisan app:create-admin                     — интерактивно
 *   php artisan app:create-admin --name=... --email=... --password=...   — без вопросов (CI, скрипты)
 */
#[Signature('app:create-admin {--name= : Имя} {--email= : Email} {--password= : Пароль (не рекомендуется: останется в истории shell)}')]
#[Description('Создать активного администратора')]
class CreateAdminCommand extends Command
{
    public function handle(CreateAdminAction $action): int
    {
        $minLength = (int) config('selen.password_min_length');

        $data = [
            'name' => $this->option('name') ?? text(
                label: 'Имя администратора',
                required: true,
            ),
            'email' => mb_strtolower(trim((string) ($this->option('email') ?? text(
                label: 'Email',
                required: true,
                validate: ['email' => ['email', Rule::unique('users', 'email')]],
            )))),
            'password' => $this->option('password') ?? password(
                label: 'Пароль',
                required: true,
                validate: ['password' => Password::defaults()],
                hint: "Не короче {$minLength} символов",
            ),
        ];

        $validator = Validator::make($data, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', Password::defaults()],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->components->error($error);
            }

            return self::FAILURE;
        }

        // Компании выбирать негде, пока она одна (экран «Компании» — П2b-2): администратор — «Компании 1»
        $user = $action->handle(Company::primary(), $data['name'], $data['email'], $data['password']);

        $this->components->info($user->isOwner()
            ? "Владелец {$user->email} создан (Владельца в системе ещё не было). Теперь можно войти в систему."
            : "Администратор {$user->email} создан. Теперь можно войти в систему.");

        return self::SUCCESS;
    }
}
