<?php

namespace App\Actions\Users;

use App\Enums\Theme;
use App\Models\User;

/**
 * Тема оформления пользователя (меню пользователя, ADR-0025). Личный вид, как свёрнутые доски и дорожки: в журнал
 * событий не пишется (решение PM 26.10).
 */
class UpdateThemeAction
{
    public function handle(User $user, Theme $theme): User
    {
        $user->theme = $theme;
        $user->save();

        return $user;
    }
}
