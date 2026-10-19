<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Symfony\Component\HttpFoundation\Response;

/**
 * Вкладка SPA сообщает, от чьего имени она работает: X-Selen-User — id пользователя вкладки (ADR-0002, LATER-57).
 * Cookie сессии общие для всех вкладок браузера: если в соседней вкладке вошли под другим пользователем, запрос этой
 * вкладки ушёл бы от имени нового. Поэтому запрос с сессией вошедшего не выполняется, если:
 * - заголовок называет другого пользователя — 409 session_changed;
 * - заголовка нет (вкладка открыта до обновления кода и о нём не знает) — 409 session_unverified: молча от имени
 *   того, кто сейчас в сессии, ничего не делаем.
 * Вкладка перечитывает пользователя и сбрасывает данные (frontend app/queryClient.ts).
 *
 * Стоит на маршрутах вошедших (routes/api.php, middleware tab-user), кроме /auth/me (кто вошёл — сервер говорит сам),
 * выхода (выйти можно из любой сессии) и файла вложения (его грузит сам браузер без заголовков); публичные маршруты (вход, восстановление пароля, приглашение) не от имени вошедшего — без
 * проверки. Проверяются только запросы SPA — те, что Sanctum считает запросами со своей страницы (cookie-сессия);
 * других клиентов API нет (ADR-0002). Порядок — до троттлинга и привязки моделей
 * (bootstrap/app.php): ни одного действия и ни одной записи от чужого имени.
 */
class EnsureSessionUserMatches
{
    public function handle(Request $request, Closure $next): Response
    {
        // Пользователь, которого установила аутентификация маршрута (auth:sanctum — сессия SPA, ADR-0002)
        $user = $request->user();
        if ($user === null || ! EnsureFrontendRequestsAreStateful::fromFrontend($request)) {
            return $next($request);
        }

        $tabUser = $request->header('X-Selen-User');
        if (! is_string($tabUser) || $tabUser === '') {
            return $this->reject('session_unverified');
        }
        if ($tabUser !== (string) $user->getKey()) {
            return $this->reject('session_changed');
        }

        return $next($request);
    }

    private function reject(string $code): Response
    {
        return response()->json(['message' => __("selen.{$code}"), 'code' => $code], 409);
    }
}
