<?php

namespace App\Actions\Checklists;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Checklist;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class RenameChecklistAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, Checklist $checklist, string $title): Checklist
    {
        return DB::transaction(function () use ($actor, $checklist, $title) {
            $this->guard->ensureNotArchived($checklist->card);

            $checklist->title = $title;
            if ($checklist->isDirty('title')) {
                $checklist->save();
                $this->events->record(EventType::CardChecklistRenamed, $actor, $checklist->card, ['checklist_id' => $checklist->id]);
            }

            return $checklist;
        });
    }
}
