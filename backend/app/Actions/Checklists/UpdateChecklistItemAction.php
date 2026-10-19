<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\ChecklistItem;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/** Текст пункта и отметка «выполнено» (кто и когда отметил — в пункте и журнале). */
class UpdateChecklistItemAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    /**
     * @param  array{text?: string, is_done?: bool}  $data
     */
    public function handle(User $actor, ChecklistItem $item, array $data): ChecklistItem
    {
        return DB::transaction(function () use ($actor, $item, $data) {
            $item = ChecklistItem::query()->lockForUpdate()->findOrFail($item->id);
            $card = $item->checklist->card;
            $this->guard->ensureNotArchived($card);
            $ids = ['checklist_id' => $item->checklist_id, 'item_id' => $item->id];

            if (isset($data['text']) && $data['text'] !== $item->text) {
                $item->text = $data['text'];
                $item->save();
                $this->events->record(EventType::CardChecklistItemEdited, $actor, $card, $ids);
            }

            if (isset($data['is_done']) && $data['is_done'] !== $item->is_done) {
                $item->forceFill([
                    'is_done' => $data['is_done'],
                    'done_at' => $data['is_done'] ? Date::now() : null,
                    'done_by' => $data['is_done'] ? $actor->id : null,
                ])->save();
                $this->events->record($data['is_done'] ? EventType::CardChecklistItemChecked : EventType::CardChecklistItemUnchecked, $actor, $card, $ids);
            }

            return $item;
        });
    }
}
