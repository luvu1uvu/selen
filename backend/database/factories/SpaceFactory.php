<?php

namespace Database\Factories;

use App\Enums\NavNodeType;
use App\Enums\SpaceRole;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\SpaceMember;
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
        ];
    }

    /** У каждого пространства есть узел в дереве навигации (как у созданного CreateSpaceAction) — в конце корня. */
    public function configure(): static
    {
        return $this->afterCreating(fn (Space $space) => NavNode::query()->forceCreate([
            'type' => NavNodeType::Space,
            'space_id' => $space->id,
            'position' => app(Positioner::class)->atEnd(NavNode::siblingsOf(null)),
        ]));
    }

    public function archived(): static
    {
        return $this->state(fn () => ['archived_at' => now()]);
    }

    /** Добавить участника с ролью (в обход Actions — только для тестов и сидов). */
    public function withMember(User $user, SpaceRole $role): static
    {
        return $this->afterCreating(fn (Space $space) => SpaceMember::query()->create([
            'space_id' => $space->id,
            'user_id' => $user->id,
            'role' => $role,
        ]));
    }
}
