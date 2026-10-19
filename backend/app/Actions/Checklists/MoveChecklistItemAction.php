<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Checklist;
use App\Models\ChecklistItem;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/** Перестановка пункта внутри своего чек-листа: клиент присылает соседей (ADR-0007). */
class MoveChecklistItemAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, ChecklistItem $item, ?string $afterId, ?string $beforeId): ChecklistItem
    {
        return DB::transaction(function () use ($actor, $item, $afterId, $beforeId) {
            Checklist::query()->lockForUpdate()->findOrFail($item->checklist_id);
            $card = $item->checklist->card;
            $this->guard->ensureNotArchived($card);

            $siblings = ChecklistItem::query()->where('checklist_id', $item->checklist_id)->whereKeyNot($item->id);
            $item->position = $this->positions->place($siblings, $afterId, $beforeId);
            $item->save();

            $this->events->record(EventType::CardChecklistItemMoved, $actor, $card, [
                'checklist_id' => $item->checklist_id,
                'item_id' => $item->id,
            ]);

            return $item;
        });
    }
}
