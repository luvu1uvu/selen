<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Маршруты, которые нужны только копии Selen с несколькими компаниями (ADR-0026): «Компании» Владельца и гости
 * компании. В режиме «одна компания» (config selen.multi_company = false, по умолчанию) их нет — 404 всем, как
 * несуществующий адрес. Права и изоляция компаний от режима не зависят: это проверяют политики и AccessResolver.
 */
class EnsureMultiCompany
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless((bool) config('selen.multi_company'), 404);

        return $next($request);
    }
}
