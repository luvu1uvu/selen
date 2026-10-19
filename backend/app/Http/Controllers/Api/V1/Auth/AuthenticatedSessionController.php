<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Actions\Auth\LoginAction;
use App\Actions\Auth\LogoutAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AuthenticatedSessionController extends Controller
{
    /** Вход. */
    public function store(LoginRequest $request, LoginAction $login): UserResource
    {
        $user = $login->handle(
            $request->string('email')->toString(),
            $request->string('password')->toString(),
            $request->boolean('remember'),
        );

        $request->session()->regenerate();

        return new UserResource($user);
    }

    /** Выход. */
    public function destroy(Request $request, LogoutAction $logout): Response
    {
        $logout->handle($request->user());

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
