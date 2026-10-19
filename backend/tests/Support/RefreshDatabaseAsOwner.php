<?php

namespace Tests\Support;

use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * RefreshDatabase с ролями базы (docs/adr/0016-db-roles.md): схему пересоздаёт владелец (pgsql_owner),
 * а тесты работают под ролью приложения (pgsql) — с теми же правами, что веб и очереди.
 */
trait RefreshDatabaseAsOwner
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    protected function migrateFreshUsing(): array
    {
        $seeder = $this->seeder();

        return array_merge(
            [
                '--database' => 'pgsql_owner',
                '--drop-views' => $this->shouldDropViews(),
                '--drop-types' => $this->shouldDropTypes(),
            ],
            $seeder ? ['--seeder' => $seeder] : ['--seed' => $this->shouldSeed()],
        );
    }
}
