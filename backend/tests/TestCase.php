<?php

namespace Tests;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Запросы «как из SPA»: Sanctum включает cookie-сессию только для запросов с доверенного домена
        $this->withHeader('Referer', 'http://localhost/');

        // Без «лотереи» очистки сессий: с вероятностью 2 % она добавляет к запросу лишний DELETE в sessions,
        // и тесты, считающие запросы (NavigationTreeTest и др.), изредка падали
        config(['session.lottery' => [0, 100]]);
    }

    /**
     * Как вкладка SPA: запросы несут id её пользователя (X-Selen-User), иначе сервер не выполнит запрос с сессией
     * (EnsureSessionUserMatches, ADR-0002, «Изменения»). Тесты расхождения задают заголовок сами.
     */
    public function actingAs(Authenticatable $user, $guard = null)
    {
        $this->withHeader('X-Selen-User', (string) $user->getAuthIdentifier());

        return parent::actingAs($user, $guard);
    }

    /**
     * Защита рабочих данных: RefreshDatabase пересоздаёт схему базы.
     * Проверка выполняется сразу после создания приложения — до миграций.
     */
    public function createApplication(): Application
    {
        $app = parent::createApplication();

        $database = (string) $app['config']->get('database.connections.'.$app['config']->get('database.default').'.database');

        if (! $app->environment('testing') || ! str_starts_with($database, 'selen_testing')) {
            throw new RuntimeException(
                "Тесты должны работать с APP_ENV=testing и базой selen_testing*, а не «{$database}». Проверьте phpunit.xml."
            );
        }

        return $app;
    }
}
