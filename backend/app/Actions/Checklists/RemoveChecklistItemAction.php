<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\ChecklistItem;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class RemoveChecklistItemAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, ChecklistItem $item): void
    {
        DB::transaction(function () use ($actor, $item) {
            $card = $item->checklist->card;
            $this->guard->ensureNotArchived($card);

            $item->delete();
            $this->events->record(EventType::CardChecklistItemRemoved, $actor, $card, [
                'checklist_id' => $item->checklist_id,
                'item_id' => $item->id,
            ]);
        });
    }
}
