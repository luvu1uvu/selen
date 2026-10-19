<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Изменение собственного профиля (имя, часовой пояс). Email меняет только администратор (позже).
 */
class UpdateProfileAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name: string, timezone: string}  $data
     */
    public function handle(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            $user->fill($data);
            $fields = array_keys($user->getDirty());
            sort($fields);

            if ($fields === []) {
                return $user;
            }

            // Имя — персональные данные: в журнал попадает только факт изменения поля.
            // Часовой пояс ПДн не является — его значения пишем целиком.
            $payload = ['fields' => $fields];
            if ($user->isDirty('timezone')) {
                $payload['timezone'] = ['from' => $user->getOriginal('timezone'), 'to' => $user->timezone];
            }

            $user->save();
            $this->events->record(EventType::UserProfileUpdated, $user, $user, $payload);

            return $user;
        });
    }
}
