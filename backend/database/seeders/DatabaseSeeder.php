<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Демо-данные создаются только в локальной разработке (APP_ENV=local).
     * В production первый администратор создаётся командой `php artisan app:create-admin`.
     * Вторая и третья компании и гости — только в режиме «несколько компаний» (SELEN_MULTI_COMPANY=true, ADR-0026);
     * по умолчанию демо — одна компания, как у каждой копии Selen.
     */
    public function run(): void
    {
        if (app()->environment('local')) {
            $this->call([DemoSeeder::class, BoardsDemoSeeder::class]);
            if (config('selen.multi_company')) {
                $this->call(CompaniesDemoSeeder::class);
            }
        }
    }
}
