<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CardSummaryResource;
use App\Models\Space;
use App\Services\Cards\CardVisibility;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Поиск карточек пространства по номеру или названию — для выбора связи и блокирующей карточки.
 * Только активные карточки на активных досках и только видимые пользователю (ADR-0008).
 */
class CardSearchController extends Controller
{
    private const LIMIT = 20;

    public function __invoke(Request $request, Space $space, CardVisibility $visibility): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);
        $search = $request->validate(['search' => ['nullable', 'string', 'max:200']])['search'] ?? '';

        $cards = $visibility->scope($space->cards()->getQuery(), $request->user(), $space)
            ->active()
            ->whereHas('board', fn ($q) => $q->whereNull('archived_at'))
            ->when($search !== '', fn ($q) => $q->matching($search, $space))
            ->with(['board', 'column.parent'])
            ->orderByDesc('number')
            ->limit(self::LIMIT)
            ->get()
            ->each(fn ($card) => $card->setRelation('space', $space));

        return CardSummaryResource::collection($cards);
    }
}
