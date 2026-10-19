<?php

use App\Models\User;
use App\Providers\AppServiceProvider;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\Console\Migrations\FreshCommand;
use Illuminate\Database\Console\Migrations\RollbackCommand;
use Illuminate\Database\Console\WipeCommand;

/**
 * Production (будущий сервер и стенд PM, ADR-0014): накопленные данные не стираются и не смешиваются с демо.
 * Флаг запрета проверяем напрямую, не запуская migrate:fresh: если запрет пропадёт, тест упадёт, а не сотрёт базу.
 */
function bootAppIn(string $environment): void
{
    app()->detectEnvironment(fn () => $environment);
    (new AppServiceProvider(app()))->boot();
}

function isProhibited(string $command): bool
{
    return (bool) (new ReflectionProperty($command, 'prohibitedFromRunning'))->getValue();
}

it('в production команды, стирающие базу, запрещены; в других окружениях — разрешены', function () {
    try {
        bootAppIn('production');
        expect(isProhibited(FreshCommand::class))->toBeTrue()
            ->and(isProhibited(WipeCommand::class))->toBeTrue()
            ->and(isProhibited(RollbackCommand::class))->toBeTrue();
    } finally {
        bootAppIn('testing');
    }

    expect(isProhibited(FreshCommand::class))->toBeFalse();
});

it('в production db:seed не загружает демо-данные', function () {
    try {
        bootAppIn('production');
        $this->artisan('db:seed', ['--class' => DatabaseSeeder::class, '--force' => true])->assertSuccessful();
    } finally {
        bootAppIn('testing');
    }

    expect(User::query()->count())->toBe(0);
});
