<?php

namespace App\Actions\CardTypes;

use App\Enums\EventType;
use App\Models\CardType;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Создание или изменение типа карточки (название, цвет).
 */
class SaveCardTypeAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, color?: string}  $data
     */
    public function handle(User $actor, array $data, ?CardType $type = null): CardType
    {
        return DB::transaction(function () use ($actor, $data, $type) {
            if (isset($data['color'])) {
                $data['color'] = mb_strtolower($data['color']);
            }

            if ($type === null) {
                $type = CardType::query()->create($data);
                $this->events->record(EventType::CardTypeCreated, $actor, $type, ['color' => $type->color]);

                return $type;
            }

            $type->fill($data);
            $fields = array_keys($type->getDirty());

            if ($fields === []) {
                return $type;
            }

            sort($fields);
            $type->save();
            $this->events->record(EventType::CardTypeUpdated, $actor, $type, ['fields' => $fields]);

            return $type;
        });
    }
}
