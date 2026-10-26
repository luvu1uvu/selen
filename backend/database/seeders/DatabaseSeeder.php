<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Демо-данные создаются только в локальной разработке (APP_ENV=local).
     * В production первый администратор создаётся командой `php artisan app:create-admin`.
     */
    public function run(): void
    {
        if (app()->environment('local')) {
            $this->call([DemoSeeder::class, BoardsDemoSeeder::class, CompaniesDemoSeeder::class]);
        }
    }
}
