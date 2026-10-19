<?php

namespace App\Actions\Groups;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Создание или изменение группы (название, описание). Уникальность названия проверяет Form Request
 * (и индекс в БД). В журнал — только факт и список изменённых полей: название и описание — тексты.
 */
class SaveGroupAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, description?: string|null}  $data
     */
    public function handle(User $actor, array $data, ?Group $group = null): Group
    {
        return DB::transaction(function () use ($actor, $data, $group) {
            if ($group === null) {
                $group = Group::query()->create($data);
                $this->events->record(EventType::GroupCreated, $actor, $group);

                return $group;
            }

            $group->fill($data);
            $fields = array_keys($group->getDirty());

            // Название встроенной группы фиксировано: по нему её узнают во всех пространствах
            if ($group->isSystem() && in_array('name', $fields, true)) {
                throw ValidationException::withMessages(['name' => __('selen.groups.system_name')]);
            }

            if ($fields === []) {
                return $group;
            }

            sort($fields);
            $group->save();
            $this->events->record(EventType::GroupUpdated, $actor, $group, ['fields' => $fields]);

            return $group;
        });
    }
}
