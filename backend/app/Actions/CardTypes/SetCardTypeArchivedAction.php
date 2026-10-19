<?php

namespace App\Actions\CardTypes;

use App\Enums\EventType;
use App\Models\CardType;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация и восстановление типа карточки. Архивный тип нельзя выбрать для новых карточек,
 * но у существующих карточек он остаётся. Тип по умолчанию архивировать нельзя.
 */
class SetCardTypeArchivedAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, CardType $type, bool $archived): CardType
    {
        return DB::transaction(function () use ($actor, $type, $archived) {
            $type = CardType::query()->lockForUpdate()->findOrFail($type->id);

            if ($archived && $type->is_default) {
                throw ValidationException::withMessages(['card_type' => __('selen.card_types.default_cannot_be_archived')]);
            }

            if ($type->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'card_type' => __($archived ? 'selen.card_types.already_archived' : 'selen.card_types.not_archived'),
                ]);
            }

            $type->forceFill(['archived_at' => $archived ? Date::now() : null])->save();
            $this->events->record($archived ? EventType::CardTypeArchived : EventType::CardTypeRestored, $actor, $type);

            return $type;
        });
    }
}
