<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\ResetPasswordAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;

class NewPasswordController extends Controller
{
    /** Установка нового пароля по токену из письма. */
    public function store(ResetPasswordRequest $request, ResetPasswordAction $action): JsonResponse
    {
        $action->handle(
            $request->string('email')->toString(),
            $request->string('token')->toString(),
            $request->string('password')->toString(),
        );

        return response()->json(['message' => __('passwords.reset')]);
    }
}
