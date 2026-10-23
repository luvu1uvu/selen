<?php

namespace Database\Factories;

use App\Enums\NavNodeType;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use App\Services\Positions\Positioner;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Space>
 */
class SpaceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->company(),
            'key' => fake()->unique()->regexify('[A-Z]{3,6}'),
            'description' => null,
            // Компания — «Компания 1», если не задана (inCompany)
            'company_id' => fn () => Company::primary()->id,
        ];
    }

    /** У каждого пространства есть узел в дереве навигации (как у созданного CreateSpaceAction) — в конце корня. */
    public function configure(): static
    {
        return $this->afterCreating(fn (Space $space) => NavNode::query()->forceCreate([
            'company_id' => $space->company_id,
            'type' => NavNodeType::Space,
            'space_id' => $space->id,
            'position' => app(Positioner::class)->atEnd(NavNode::siblingsOf($space->company_id, null)),
        ]));
    }

    /** Пространство другой компании (тесты изоляции). */
    public function inCompany(Company $company): static
    {
        return $this->state(fn () => ['company_id' => $company->id]);
    }

    public function archived(): static
    {
        return $this->state(fn () => ['archived_at' => now()]);
    }

    /** Добавить участника с ролью — личная выдача (в обход Actions — только для тестов и сидов). */
    public function withMember(User $user, SpaceRole $role): static
    {
        return $this->afterCreating(fn (Space $space) => AccessGrant::query()->forceCreate([
            'company_id' => $space->company_id,
            'nav_node_id' => NavNode::query()->where('space_id', $space->id)->valueOrFail('id'),
            'user_id' => $user->id,
            'role_id' => Role::standard(StandardRole::fromLegacy($role))->id,
        ]));
    }
}
