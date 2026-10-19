<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\Checklist;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/** Новый чек-лист — в конец списка чек-листов карточки. */
class AddChecklistAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Card $card, string $title): Checklist
    {
        return DB::transaction(function () use ($actor, $card, $title) {
            $card = Card::query()->lockForUpdate()->findOrFail($card->id);
            $this->guard->ensureNotArchived($card);

            $checklist = new Checklist(['title' => $title]);
            $checklist->forceFill([
                'card_id' => $card->id,
                'position' => $this->positions->atEnd(Checklist::query()->where('card_id', $card->id)),
            ])->save();

            $this->events->record(EventType::CardChecklistAdded, $actor, $card, ['checklist_id' => $checklist->id]);

            return $checklist;
        });
    }
}
