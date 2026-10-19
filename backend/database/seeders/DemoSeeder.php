<?php

namespace Database\Seeders;

use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Database\Seeder;

/**
 * Демо-пользователи для локальной разработки. Пароль у всех: UserFactory::PASSWORD.
 * Список — в README.md.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // Владелец (ADR-0017) — один; обычный системный администратор — для сравнения прав
        User::factory()->owner()->create(['name' => 'Демо Владелец', 'email' => 'owner@selen.test']);
        User::factory()->admin()->create(['name' => 'Демо Администратор', 'email' => 'admin@selen.test']);
        User::factory()->create(['name' => 'Демо Участник', 'email' => 'member@selen.test']);
        User::factory()->deactivated()->create(['name' => 'Демо Деактивированный', 'email' => 'deactivated@selen.test']);

        $this->command->info('Демо-пользователи: owner@selen.test (Владелец), admin@selen.test, member@selen.test (пароль: '.UserFactory::PASSWORD.')');
    }
}
