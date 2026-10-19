<?php

namespace App\Http\Resources;

use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Карточка в «Корзине» (ADR-0015) — только системному администратору: номер, название, где лежала,
 * кто и когда удалил. После восстановления deleted_at и deleted_by — null.
 * Название — только тому, кто видел бы карточку, не будь она в корзине (CardVisibility::wouldSee: доступ к
 * пространству и, в режиме «только свои», своя карточка — ADR-0008, ADR-0015): иначе title = null,
 * title_hidden = true, и текст названия в ответ не попадает (решение PM).
 *
 * @mixin Card
 */
class TrashedCardResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();
        $titleVisible = app(CardVisibility::class)->wouldSee($user, $this->resource);

        return [
            'id' => $this->id,
            'key' => $this->key(),
            'title' => $titleVisible ? $this->title : null,
            'title_hidden' => ! $titleVisible,
            'space' => ['id' => $this->space->id, 'key' => $this->space->key, 'name' => $this->space->name],
            'board' => ['id' => $this->board->id, 'name' => $this->board->name],
            // Удалена из архива — туда же и вернётся
            'archived' => $this->isArchived(),
            'deleted_at' => $this->deleted_at?->toIso8601ZuluString(),
            'deleted_by' => $this->deleter === null ? null : ['id' => $this->deleter->id, 'name' => $this->deleter->name],
        ];
    }
}
