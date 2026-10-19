<?php

namespace App\Actions\CardLinks;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\CardLink;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/** Ссылка на внешний ресурс (URL проверяет Form Request: только http и https). */
class AddCardLinkAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    /**
     * @param  array{url: string, title?: string|null}  $data
     */
    public function handle(User $actor, Card $card, array $data): CardLink
    {
        return DB::transaction(function () use ($actor, $card, $data) {
            $this->guard->ensureNotArchived($card);

            $link = new CardLink($data);
            $link->forceFill(['card_id' => $card->id, 'created_by' => $actor->id])->save();
            $this->events->record(EventType::CardLinkAdded, $actor, $card, ['link_id' => $link->id]);

            return $link;
        });
    }
}
