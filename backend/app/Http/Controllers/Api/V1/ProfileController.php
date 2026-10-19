<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\ChangePasswordAction;
use App\Actions\Users\UpdateProfileAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\UpdatePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ProfileController extends Controller
{
    /** Изменение имени и часового пояса. */
    public function update(UpdateProfileRequest $request, UpdateProfileAction $action): UserResource
    {
        /** @var array{name: string, timezone: string} $data */
        $data = $request->validated();

        return new UserResource($action->handle($request->user(), $data));
    }

    /** Смена пароля с вводом текущего. */
    public function updatePassword(UpdatePasswordRequest $request, ChangePasswordAction $action): JsonResponse
    {
        $user = $request->user();
        $guard = Auth::guard('web');
        $remembered = $request->hasCookie($guard->getRecallerName());

        $action->handle($user, $request->string('password')->toString(), $request->session()->getId());

        // remember_token сменился: перевыпускаем cookie «Запомнить меня» для текущего устройства
        if ($remembered) {
            $guard->login($user, remember: true);
        }

        return response()->json(['message' => __('selen.profile.password_changed')]);
    }
}
