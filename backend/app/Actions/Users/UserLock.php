<?php

namespace App\Actions\Users;

use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Validation\ValidationException;

/**
 * Блокировка строк автора и цели перед изменением учётной записи (ADR-0017). Политика проверила права по ролям,
 * прочитанным до блокировки; если за это время роль цели или автора изменилась (участника параллельно назначили
 * администратором компании, автор передал владение), — 422: права надо проверить заново. Строки блокируются по
 * возрастанию id — в том же порядке, что и в TransferOwnershipAction (без взаимных блокировок); затем — их членство
 * в компании (признак администратора компании, ADR-0024).
 */
class UserLock
{
    public function __construct(private readonly AccessResolver $resolver) {}

    /**
     * @return User цель — свежая строка под блокировкой
     */
    public function lock(User $actor, User $target, Company $company): User
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

        // Администратор компании — как его видела политика (Company::permissionsOf кеширует права на запрос)
        $admins = $this->resolver->lockAdminFlags($company, $ids);
        foreach ([$actor, $target] as $user) {
            if (! $user->isOwner() && ($admins[$user->id] ?? false) !== $company->permissionsOf($user)->isAdmin()) {
                throw ValidationException::withMessages(['user' => __('selen.users.roles_changed')]);
            }
        }

        return $locked;
    }
}
