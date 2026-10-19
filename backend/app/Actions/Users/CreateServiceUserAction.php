<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Служебная учётная запись (обычный сотрудник, не администратор) с паролем — из консоли, без приглашения.
 * Сейчас — QA-бот стенда PM (make pm-qa-bot). Доступы к пространствам выдаются отдельно.
 */
class CreateServiceUserAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(string $name, string $email, #[\SensitiveParameter] string $password): User
    {
        return DB::transaction(function () use ($name, $email, $password) {
            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'role' => UserRole::Member,
                'status' => UserStatus::Active,
                'timezone' => config('selen.default_timezone'),
            ]);

            $this->events->record(EventType::UserCreated, null, $user, [
                'role' => UserRole::Member->value,
                'via' => 'console',
            ]);

            return $user;
        });
    }
}
