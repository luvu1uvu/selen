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

/** Новый пункт чек-листа — после указанного (after_id) или в конец. */
class AddChecklistItemAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Checklist $checklist, string $text, ?string $afterId = null): ChecklistItem
    {
        return DB::transaction(function () use ($actor, $checklist, $text, $afterId) {
            $checklist = Checklist::query()->lockForUpdate()->findOrFail($checklist->id);
            $this->guard->ensureNotArchived($checklist->card);

            $siblings = ChecklistItem::query()->where('checklist_id', $checklist->id);
            $item = new ChecklistItem(['text' => $text]);
            $item->forceFill([
                'checklist_id' => $checklist->id,
                'position' => $afterId === null ? $this->positions->atEnd($siblings) : $this->positions->place($siblings, $afterId),
            ])->save();

            $this->events->record(EventType::CardChecklistItemAdded, $actor, $checklist->card, [
                'checklist_id' => $checklist->id,
                'item_id' => $item->id,
            ]);

            return $item;
        });
    }
}
