<?php

namespace App\Actions\Labels;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Создание или изменение метки. Без пространства — общая метка компании (ADR-0024), с пространством — метка
 * пространства в его компании.
 * Уникальность названия среди активных меток набора проверяет Form Request (и индекс в БД).
 */
class SaveLabelAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  array{name?: string, color?: string}  $data
     */
    public function handle(User $actor, array $data, ?Label $label = null, ?Space $space = null, ?Company $company = null): Label
    {
        return DB::transaction(function () use ($actor, $data, $label, $space, $company) {
            if (isset($data['color'])) {
                $data['color'] = mb_strtolower($data['color']);
            }

            if ($label === null) {
                $label = new Label($data);
                $label->space_id = $space?->id;
                $label->company_id = $space->company_id ?? $company->id ?? throw new LogicException('A company label needs a company');
                $label->save();
                $this->events->record(EventType::LabelCreated, $actor, $label, array_filter([
                    'space_id' => $label->space_id,
                    'color' => $label->color,
                ]));

                return $label;
            }

            $label->fill($data);
            $fields = array_keys($label->getDirty());

            if ($fields === []) {
                return $label;
            }

            sort($fields);
            $label->save();
            $this->events->record(EventType::LabelUpdated, $actor, $label, ['fields' => $fields]);

            return $label;
        });
    }
}
