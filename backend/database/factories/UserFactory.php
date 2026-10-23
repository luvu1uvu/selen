<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Company;
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

    /**
     * Каждый пользователь — «дом» в компании (ADR-0024): по умолчанию в «Компании 1» (Company::primary()), иначе —
     * inCompany(). Состояния ниже заменяют членство целиком (sync) — последнее и действует.
     */
    public function configure(): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->attach(Company::primary()->id, ['kind' => 'home']));
    }

    /** «Дом» в этой компании вместо «Компании 1» (тесты изоляции: человек другой компании). */
    public function inCompany(Company $company, bool $admin = false): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->sync([
            $company->id => ['kind' => 'home', 'is_admin' => $admin],
        ]));
    }

    /** Администратор компании (по умолчанию — «Компании 1»). */
    public function admin(?Company $company = null): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->sync([
            ($company ?? Company::primary())->id => ['kind' => 'home', 'is_admin' => true],
        ]));
    }

    /** Владелец (ADR-0017): в базе не больше одного; «дом» — «Компания 1», как у Владельца после перехода. */
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
