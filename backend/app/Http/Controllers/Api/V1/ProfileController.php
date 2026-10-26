<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\ChangePasswordAction;
use App\Actions\Users\UpdateProfileAction;
use App\Actions\Users\UpdateThemeAction;
use App\Enums\Theme;
use App\Http\Controllers\Controller;
use App\Http\Requests\Profile\UpdatePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Requests\Profile\UpdateThemeRequest;
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

    /** Тема оформления: «Светлая / Тёмная / Как в системе» (меню пользователя, ADR-0025). */
    public function updateTheme(UpdateThemeRequest $request, UpdateThemeAction $action): UserResource
    {
        return new UserResource($action->handle($request->user(), $request->enum('theme', Theme::class)));
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
