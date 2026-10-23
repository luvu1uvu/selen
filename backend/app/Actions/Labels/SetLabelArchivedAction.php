<?php

namespace App\Actions\Labels;

use App\Enums\EventType;
use App\Models\Label;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация и восстановление метки. Архивную метку нельзя поставить на карточку,
 * но там, где она уже стоит, она остаётся.
 */
class SetLabelArchivedAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Label $label, bool $archived): Label
    {
        return DB::transaction(function () use ($actor, $label, $archived) {
            $label = Label::query()->lockForUpdate()->findOrFail($label->id);

            if ($label->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'label' => __($archived ? 'selen.labels.already_archived' : 'selen.labels.not_archived'),
                ]);
            }

            // Пока метка была в архиве, её название могли занять
            if (! $archived && $this->nameTaken($label)) {
                throw ValidationException::withMessages(['label' => __('selen.labels.name_taken')]);
            }

            $label->forceFill(['archived_at' => $archived ? Date::now() : null])->save();
            $this->events->record($archived ? EventType::LabelArchived : EventType::LabelRestored, $actor, $label);

            return $label;
        });
    }

    private function nameTaken(Label $label): bool
    {
        return Label::query()
            ->active()
            ->inCompany($label->company_id)
            ->whereKeyNot($label->id)
            ->where(fn ($q) => $label->space_id === null ? $q->whereNull('space_id') : $q->where('space_id', $label->space_id))
            ->whereRaw('lower(name) = lower(?)', [$label->name])
            ->exists();
    }
}
