<?php

namespace App\Actions\CardLinks;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\CardLink;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class RemoveCardLinkAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, CardLink $link): void
    {
        DB::transaction(function () use ($actor, $link) {
            $card = $link->card;
            $this->guard->ensureNotArchived($card);

            $link->delete();
            $this->events->record(EventType::CardLinkRemoved, $actor, $card, ['link_id' => $link->id]);
        });
    }
}
