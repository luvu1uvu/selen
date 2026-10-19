<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /** Пароль всех пользователей из фабрики (тесты и dev-сиды). */
    public const PASSWORD = 'password-123';

    protected static ?string $password;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make(self::PASSWORD),
            'role' => UserRole::Member,
            'status' => UserStatus::Active,
            'timezone' => 'Europe/Moscow',
            'remember_token' => Str::random(10),
        ];
    }

    public function admin(): static
    {
        return $this->state(fn () => ['role' => UserRole::Admin]);
    }

    /** Владелец (ADR-0017): в базе не больше одного. */
    public function owner(): static
    {
        return $this->state(fn () => ['role' => UserRole::Owner]);
    }

    /** Приглашён, пароль ещё не задан. */
    public function invited(): static
    {
        return $this->state(fn () => ['status' => UserStatus::Invited, 'password' => null]);
    }

    public function deactivated(): static
    {
        return $this->state(fn () => ['status' => UserStatus::Deactivated, 'deactivated_at' => now()]);
    }
}
