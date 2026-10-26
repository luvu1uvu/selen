<?php

namespace Database\Factories;

use App\Models\Company;
use App\Services\Companies\CompanyTemplate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Компания со справочниками из шаблона (CompanyTemplate) — как новая компания П2b-2. «Компанию 1» создаёт миграция
 * (Company::primary()); фабрика — для второй компании тестов изоляции.
 *
 * @extends Factory<Company>
 */
class CompanyFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return ['name' => 'Компания '.fake()->unique()->numberBetween(2, 99999)];
    }

    public function configure(): static
    {
        return $this->afterCreating(fn (Company $company) => app(CompanyTemplate::class)->apply($company));
    }
}
