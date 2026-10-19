<?php

namespace App\Actions\Groups;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Добавление человека в группу: доступ группы к пространствам он получает со следующего запроса. */
class AddGroupMemberAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Group $group, User $user): void
    {
        DB::transaction(function () use ($actor, $group, $user) {
            $group = Group::query()->lockForUpdate()->findOrFail($group->id);

            if ($group->isSystem()) {
                throw ValidationException::withMessages(['user_id' => __('selen.groups.system_members')]);
            }

            if ($user->isDeactivated()) {
                throw ValidationException::withMessages(['user_id' => __('selen.groups.member_deactivated')]);
            }

            if ($group->members()->whereKey($user->id)->exists()) {
                throw ValidationException::withMessages(['user_id' => __('selen.groups.already_member')]);
            }

            $group->members()->attach($user->id, ['added_by' => $actor->id, 'created_at' => Date::now()]);
            $this->events->record(EventType::GroupMemberAdded, $actor, $group, ['user_id' => $user->id]);
        });
    }
}
