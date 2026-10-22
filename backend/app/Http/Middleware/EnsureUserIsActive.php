<?php

namespace App\Http\Middleware;

use App\Http\Controllers\FileController;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Второй рубеж после удаления сессий при деактивации: если неактивный пользователь
 * всё же пришёл с действующей сессией, завершаем её и отвечаем 401.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null && ! $user->isActive()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            // Ссылка на файл открыта браузером (UI-1b) — как без входа: на страницу входа
            if ($request->routeIs('files.show')) {
                return redirect(FileController::loginUrl($request));
            }

            return response()->json(['message' => __('selen.auth.deactivated')], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
