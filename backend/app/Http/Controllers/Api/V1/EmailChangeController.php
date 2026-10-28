<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Users\ConfirmEmailChangeAction;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Страница подтверждения нового email по ссылке из письма (П2c-2, LATER-9; доступна без входа). Открыть ссылку мало —
 * email меняет только кнопка «Подтвердить» (POST): почтовые сканеры, которые сами открывают ссылки из писем, его не
 * сменят.
 */
class EmailChangeController extends Controller
{
    /** Какой адрес подтверждается — его владелец и так видит его в своей почте. */
    public function show(string $token, ConfirmEmailChangeAction $action): JsonResponse
    {
        return response()->json(['data' => ['email' => $action->findUsable($token)->new_email]]);
    }

    public function store(string $token, ConfirmEmailChangeAction $action): JsonResponse
    {
        return response()->json(['data' => ['email' => $action->handle($token)->email]]);
    }
}
