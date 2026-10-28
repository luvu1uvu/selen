<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Users\ConfirmEmailChangeAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ConfirmEmailChangeRequest;
use Illuminate\Http\JsonResponse;

/**
 * Страница подтверждения нового email по ссылке из письма (П2c-2, LATER-9; доступна без входа). Открыть ссылку мало —
 * email меняет только «Подтвердить» (POST) с нынешним паролем учётной записи: почтовые сканеры, которые сами открывают
 * ссылки, и тот, у кого есть только ссылка, его не сменят.
 */
class EmailChangeController extends Controller
{
    /** Какой адрес подтверждается — его владелец и так видит его в своей почте. */
    public function show(#[\SensitiveParameter] string $token, ConfirmEmailChangeAction $action): JsonResponse
    {
        return response()->json(['data' => ['email' => $action->findUsable($token)->new_email]]);
    }

    public function store(ConfirmEmailChangeRequest $request, #[\SensitiveParameter] string $token, ConfirmEmailChangeAction $action): JsonResponse
    {
        return response()->json(['data' => ['email' => $action->handle($token, $request->string('password')->toString())->email]]);
    }
}
