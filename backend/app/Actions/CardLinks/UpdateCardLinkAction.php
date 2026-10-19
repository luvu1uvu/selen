<?php

namespace App\Actions\CardLinks;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\CardLink;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

class UpdateCardLinkAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    /**
     * @param  array{url?: string, title?: string|null}  $data
     */
    public function handle(User $actor, CardLink $link, array $data): CardLink
    {
        return DB::transaction(function () use ($actor, $link, $data) {
            $this->guard->ensureNotArchived($link->card);

            $link->fill($data);
            $fields = array_keys($link->getDirty());
            if ($fields !== []) {
                sort($fields);
                $link->save();
                $this->events->record(EventType::CardLinkUpdated, $actor, $link->card, ['link_id' => $link->id, 'fields' => $fields]);
            }

            return $link;
        });
    }
}
