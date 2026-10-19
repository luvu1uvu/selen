<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Изменение названия и описания пространства. Ключ не меняется: он входит в номера карточек и ссылки.
 */
class UpdateSpaceAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, description?: string|null}  $data
     */
    public function handle(User $actor, Space $space, array $data): Space
    {
        return DB::transaction(function () use ($actor, $space, $data) {
            $space->fill($data);
            $fields = array_keys($space->getDirty());

            if ($fields === []) {
                return $space;
            }

            sort($fields);
            $space->save();
            $this->events->record(EventType::SpaceUpdated, $actor, $space, ['fields' => $fields]);

            return $space;
        });
    }
}
