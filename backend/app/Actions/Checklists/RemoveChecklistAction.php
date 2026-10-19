<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Checklist;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/** Удаление чек-листа вместе с пунктами (каскад в БД). Факт — в журнале. */
class RemoveChecklistAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, Checklist $checklist): void
    {
        DB::transaction(function () use ($actor, $checklist) {
            $card = $checklist->card;
            $this->guard->ensureNotArchived($card);

            $checklist->delete();
            $this->events->record(EventType::CardChecklistRemoved, $actor, $card, ['checklist_id' => $checklist->id]);
        });
    }
}
