<?php

namespace App\Actions\Users;

use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Validation\ValidationException;

/**
 * Блокировка строк автора и цели перед изменением учётной записи (ADR-0017). Политика проверила права по ролям,
 * прочитанным до блокировки; если за это время роль цели или автора изменилась (участника параллельно назначили
 * администратором, автор передал владение), — 422: права надо проверить заново. Строки блокируются по
 * возрастанию id — в том же порядке, что и в TransferOwnershipAction (без взаимных блокировок).
 */
class UserLock
{
    /**
     * @return User цель — свежая строка под блокировкой
     */
    public function lock(User $actor, User $target): User
    {
        // По одной строке, а не коллекцией: у модели из коллекции запрещена ленивая загрузка (ресурсы её используют)
        $ids = array_unique([$actor->id, $target->id]);
        sort($ids);
        $rows = [];
        foreach ($ids as $id) {
            $rows[$id] = User::query()->lockForUpdate()->find($id);
        }

        $locked = $rows[$target->id] ?? throw (new ModelNotFoundException)->setModel(User::class, [$target->id]);
        if ($locked->role !== $target->role || $rows[$actor->id]?->role !== $actor->role) {
            throw ValidationException::withMessages(['user' => __('selen.users.roles_changed')]);
        }

        return $locked;
    }
}
