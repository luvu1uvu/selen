<?php

namespace App\Actions\CardTypes;

use App\Enums\EventType;
use App\Models\CardType;
use App\Models\Company;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/**
 * Создание или изменение типа карточки компании (название, цвет; ADR-0024).
 */
class SaveCardTypeAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, color?: string}  $data
     */
    public function handle(User $actor, Company $company, array $data, ?CardType $type = null): CardType
    {
        return DB::transaction(function () use ($actor, $company, $data, $type) {
            if (isset($data['color'])) {
                $data['color'] = mb_strtolower($data['color']);
            }

            if ($type === null) {
                $type = new CardType($data);
                $type->forceFill(['company_id' => $company->id])->save();
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
