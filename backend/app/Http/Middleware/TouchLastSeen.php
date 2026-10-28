<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * «Последняя активность» в «Пользователях» (П2c-2): время последнего запроса вошедшего пользователя. Пишется не на
 * каждый запрос, а не чаще раза в selen.last_seen_interval_minutes: устаревшее ли время, видно по уже загруженной модели,
 * поэтому в остальные запросы лишнего обращения к базе нет. Запись — запросом без модели: не трогает updated_at и не
 * идёт в журнал событий.
 */
class TouchLastSeen
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // После запроса (пишется и при выходе: guard sanctum помнит пользователя — выход тоже активность)
        $user = $request->user();
        if ($user instanceof User) {
            $this->touch($user);
        }

        return $response;
    }

    private function touch(User $user): void
    {
        $now = Date::now();
        $threshold = $now->copy()->subMinutes((int) config('selen.last_seen_interval_minutes'));
        if ($user->last_seen_at !== null && $user->last_seen_at->greaterThan($threshold)) {
            return;
        }

        // Условие и в запросе: два одновременных запроса не пишут время дважды
        DB::table('users')
            ->where('id', $user->getKey())
            ->where(fn ($q) => $q->whereNull('last_seen_at')->orWhere('last_seen_at', '<=', $threshold))
            ->update(['last_seen_at' => $now]);
        $user->setAttribute('last_seen_at', $now)->syncOriginalAttribute('last_seen_at');
    }
}
