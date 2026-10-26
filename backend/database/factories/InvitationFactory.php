<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invitation>
 */
class InvitationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => fn () => Company::primary()->id,
            'user_id' => User::factory()->invited(),
            'email' => fn (array $attributes) => User::query()->findOrFail($attributes['user_id'])->email,
            'token_hash' => Invitation::hashToken(Str::random(64)),
            'invited_by_id' => null,
            'expires_at' => now()->addHours(72),
        ];
    }

    /** Приглашение с известным токеном (для тестов ссылки). */
    public function withToken(string $token): static
    {
        return $this->state(fn () => ['token_hash' => Invitation::hashToken($token)]);
    }

    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subHour()]);
    }
}
