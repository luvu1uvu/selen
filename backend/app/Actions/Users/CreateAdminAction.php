<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Создание активного администратора (используется командой app:create-admin). Если Владельца ещё нет
 * (первый администратор на новом сервере), создаётся Владелец (ADR-0017).
 */
class CreateAdminAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(string $name, string $email, #[\SensitiveParameter] string $password): User
    {
        return DB::transaction(function () use ($name, $email, $password) {
            // Одновременный второй запуск упрётся в уникальный индекс users_single_owner — второго Владельца не будет
            $role = User::query()->where('role', UserRole::Owner)->exists() ? UserRole::Admin : UserRole::Owner;

            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'role' => $role,
                'status' => UserStatus::Active,
                'timezone' => config('selen.default_timezone'),
            ]);

            $this->events->record(EventType::UserCreated, null, $user, [
                'role' => $role->value,
                'via' => 'console',
            ]);

            return $user;
        });
    }
}
