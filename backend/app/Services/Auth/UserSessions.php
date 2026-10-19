<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Управление сессиями пользователя.
 *
 * Сессии хранятся в таблице sessions (SESSION_DRIVER=database), поэтому их можно
 * завершить для конкретного пользователя. Подробнее — docs/adr/0002-auth-sanctum-spa.md.
 */
class UserSessions
{
    /**
     * Завершить сессии пользователя и сделать недействительными cookie «Запомнить меня».
     *
     * @param  string|null  $exceptSessionId  id сессии, которую нужно оставить (текущее устройство)
     */
    public function terminate(User $user, ?string $exceptSessionId = null): void
    {
        DB::table('sessions')
            ->where('user_id', $user->getKey())
            ->when($exceptSessionId, fn ($query) => $query->where('id', '!=', $exceptSessionId))
            ->delete();

        // Новый remember_token — старые cookie «Запомнить меня» больше не подходят
        $user->forceFill(['remember_token' => Str::random(60)])->saveQuietly();
    }
}
