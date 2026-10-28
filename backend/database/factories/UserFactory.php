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
        return $this->afterCreating(fn (User $user) => $user->companies()->attach(Company::primary()->id, self::home($user)));
    }

    /** «Дом» в этой компании вместо «Компании 1» (тесты изоляции: человек другой компании). */
    public function inCompany(Company $company, bool $admin = false): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->sync([
            $company->id => self::home($user, $admin),
        ]));
    }

    /** Администратор компании (по умолчанию — «Компании 1»). */
    public function admin(?Company $company = null): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->sync([
            ($company ?? Company::primary())->id => self::home($user, true),
        ]));
    }

    /**
     * Членство «дом»: у деактивированного (status deactivated, без блокировки Владельцем) — убран из компании, как
     * после деактивации в компании (П2c: вход закрыт, когда не осталось действующего «дома»).
     *
     * @return array<string, mixed>
     */
    private static function home(User $user, bool $admin = false): array
    {
        $removed = $user->status === UserStatus::Deactivated && $user->blocked_at === null;

        return ['kind' => 'home', 'is_admin' => $admin, 'deactivated_at' => $removed ? ($user->deactivated_at ?? now()) : null];
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

    /** Деактивирован во всех своих компаниях (вход закрыт). */
    public function deactivated(): static
    {
        return $this->state(fn () => ['status' => UserStatus::Deactivated, 'deactivated_at' => now()]);
    }

    /** Учётную запись отключил Владелец (П2c): членство не тронуто. */
    public function blocked(): static
    {
        return $this->state(fn () => ['status' => UserStatus::Deactivated, 'deactivated_at' => now(), 'blocked_at' => now()]);
    }

    /** Гость компании (П2c): «дом» — в своей компании (по умолчанию «Компания 1»), гостевой доступ — в $company. */
    public function guestIn(Company $company, mixed $expiresAt = null): static
    {
        return $this->afterCreating(fn (User $user) => $user->companies()->newPivotStatement()->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'kind' => 'guest',
            'expires_at' => $expiresAt,
            'created_at' => now(),
            'updated_at' => now(),
        ]));
    }
}
