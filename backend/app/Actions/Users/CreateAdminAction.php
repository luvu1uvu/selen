<?php

namespace App\Actions\Users;

use App\Enums\CompanyRole;
use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Создание активного администратора компании (используется командой app:create-admin). Если Владельца ещё нет
 * (первый администратор на новом сервере), создаётся Владелец (ADR-0017); «дом» — в этой компании (ADR-0024).
 */
class CreateAdminAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(Company $company, string $name, string $email, #[\SensitiveParameter] string $password): User
    {
        return DB::transaction(function () use ($company, $name, $email, $password) {
            // Одновременный второй запуск упрётся в уникальный индекс users_single_owner — второго Владельца не будет
            $role = User::query()->where('role', UserRole::Owner)->exists() ? UserRole::Member : UserRole::Owner;

            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'role' => $role,
                'status' => UserStatus::Active,
                'timezone' => config('selen.default_timezone'),
            ]);

            // Владелец — администратор всех компаний по роли; остальным — администратор компании
            $company->users()->attach($user->id, ['kind' => AccessResolver::HOME, 'is_admin' => $role !== UserRole::Owner]);

            // role в событии — как раньше: owner или admin (администратор компании)
            $this->events->record(EventType::UserCreated, null, $user, [
                'role' => $role === UserRole::Owner ? UserRole::Owner->value : CompanyRole::Admin->value,
                'via' => 'console',
            ], company: $company);

            return $user;
        });
    }
}
