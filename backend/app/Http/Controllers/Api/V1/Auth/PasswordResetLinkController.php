<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\SendPasswordResetLinkAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use Illuminate\Http\JsonResponse;

class PasswordResetLinkController extends Controller
{
    /** Запрос ссылки для сброса пароля. Ответ всегда одинаковый. */
    public function store(ForgotPasswordRequest $request, SendPasswordResetLinkAction $action): JsonResponse
    {
        $action->handle($request->string('email')->toString());

        return response()->json(['message' => __('selen.password_reset.link_sent')]);
    }
}
