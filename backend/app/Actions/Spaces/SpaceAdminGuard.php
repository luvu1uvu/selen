<?php

namespace App\Actions\Spaces;

use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Space;
use App\Models\SpaceMember;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Инвариант «в пространстве есть администратор» (ADR-0005, ADR-0012): хотя бы один ЛИЧНЫЙ
 * (space_members, не через группу) не деактивированный admin. Администраторы через группы — дополнительные.
 * Строго действует на операции с участниками и группами; деактивацию не блокирует (решение PM этапа 3),
 * но её последствия показывает lastAdminSpaces().
 */
class SpaceAdminGuard
{
    /** Заблокировать пространство до конца транзакции: изменения состава участников идут по очереди. */
    public function lock(Space $space): Space
    {
        return Space::query()->lockForUpdate()->findOrFail($space->getKey());
    }

    /** Вызывать внутри транзакции после lock(). */
    public function ensureAnotherAdminRemains(Space $space, User $user): void
    {
        $anotherAdminExists = SpaceMember::query()
            ->where('space_id', $space->getKey())
            ->where('role', SpaceRole::Admin)
            ->where('user_id', '!=', $user->getKey())
            ->whereHas('user', fn ($q) => $q->where('status', '!=', UserStatus::Deactivated))
            ->exists();

        if (! $anotherAdminExists) {
            throw ValidationException::withMessages(['role' => __('selen.spaces.last_admin')]);
        }
    }

    /**
     * Пространства, где пользователь — последний личный не деактивированный администратор
     * (после его деактивации там не останется действующего администратора).
     *
     * @return Collection<int, Space>
     */
    public function lastAdminSpaces(User $user): Collection
    {
        return Space::query()
            ->whereHas('members', fn ($q) => $q->where('user_id', $user->getKey())->where('role', SpaceRole::Admin))
            ->whereDoesntHave('members', fn ($q) => $q
                ->where('role', SpaceRole::Admin)
                ->where('user_id', '!=', $user->getKey())
                ->whereHas('user', fn ($q) => $q->where('status', '!=', UserStatus::Deactivated)))
            ->orderBy('name')
            ->get();
    }
}
