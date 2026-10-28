<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

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
            $this->lastSeen();
        }
    }

    /**
     * «Последняя активность» в «Пользователях» (П2c-2): у части людей — разное время (минут назад), чтобы было что
     * сортировать; у остальных — «—», пока они не войдут.
     */
    private function lastSeen(): void
    {
        $minutesAgo = [
            'member@selen.test' => 12,
            'anna@selen.test' => 95,
            'boris@selen.test' => 60 * 26,
            'admin@selen.test' => 60 * 24 * 9,
        ];
        foreach ($minutesAgo as $email => $minutes) {
            DB::table('users')->where('email', $email)->update(['last_seen_at' => now()->subMinutes($minutes)]);
        }
        $this->command->info('Последняя активность: member@ — 12 мин назад, anna@ — 1,5 ч, boris@ — вчера, admin@ — 9 дней.');
    }
}
