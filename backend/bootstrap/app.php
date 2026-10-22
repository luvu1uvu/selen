<?php

use App\Http\Controllers\FileController;
use App\Http\Middleware\EnsureSessionUserMatches;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Cookie-аутентификация Sanctum для SPA на том же домене
        $middleware->statefulApi();
        // Запрос вкладки не от имени пользователя сессии (вошли в соседней вкладке) или без X-Selen-User — 409, не
        // выполняется. Middleware tab-user — на маршрутах вошедших (routes/api.php); до троттлинга и привязки моделей
        $middleware->prependToPriorityList(ThrottleRequests::class, EnsureSessionUserMatches::class);
        // Деактивированный с уцелевшей сессией — 401 до привязки моделей: иначе по 404/401 он отличил бы
        // существующий ключ пространства от несуществующего (ADR-0002, «второй рубеж»)
        $middleware->prependToPriorityList(SubstituteBindings::class, EnsureUserIsActive::class);
        // Доверенные прокси — только TRUSTED_PROXIES (config/trustedproxy.php). Не «*»: тогда IP клиента —
        // самый левый адрес X-Forwarded-For, его присылает сам клиент (LATER-61, ADR-0021)
        $middleware->alias([
            'active' => EnsureUserIsActive::class,
            'tab-user' => EnsureSessionUserMatches::class,
        ]);
        // API без редиректов на страницу входа: гость получает 401 JSON. Ссылка на файл (/files/{id}, UI-1b) — на вход
        // с возвратом к файлу: страница входа принимает только next вида /files/<id>
        $middleware->redirectGuestsTo(fn (Request $request) => $request->routeIs('files.show')
            ? FileController::loginUrl($request)
            : null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Любой 404 в API выглядит одинаково: «не существует» и «чужое пространство» неотличимы,
        // а имя модели и ключ из запроса в ответ не попадают (docs/adr/0005-space-access.md). Так же — любой 404 в JSON
        // (ссылка на файл /files/{id} с Accept: application/json, UI-1b); страница 404 и так одна (errors::404, без текста
        // исключения — и с APP_DEBUG).
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if ($e->getStatusCode() === 404 && ($request->is('api/*') || $request->expectsJson())) {
                return response()->json(['message' => __('selen.not_found')], 404);
            }

            return null;
        });
    })->create();
