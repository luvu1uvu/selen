<?php

namespace App\Actions\Groups;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Исключение из группы: доступ через эту группу пропадает со следующего запроса.
 * Инвариант «личный администратор» не затрагивается — администраторы через группы дополнительные.
 * Состав встроенной группы «Все сотрудники» вычисляется — менять его нельзя (422).
 */
class RemoveGroupMemberAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Group $group, User $user): void
    {
        DB::transaction(function () use ($actor, $group, $user) {
            $group = Group::query()->lockForUpdate()->findOrFail($group->id);

            if ($group->isSystem()) {
                throw ValidationException::withMessages(['user_id' => __('selen.groups.system_members')]);
            }

            if ($group->members()->detach($user->id) === 0) {
                abort(404);
            }

            $this->events->record(EventType::GroupMemberRemoved, $actor, $group, ['user_id' => $user->id]);
        });
    }
}
