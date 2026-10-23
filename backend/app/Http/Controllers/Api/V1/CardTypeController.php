<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CardTypeResource;
use App\Models\CardType;
use App\Models\Space;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Активные типы карточек компании пространства (ADR-0024) — для выбора при создании и редактировании карточки.
 * Видят участники пространства (не участник — 404).
 */
class CardTypeController extends Controller
{
    public function index(Space $space): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);

        return CardTypeResource::collection(CardType::query()->inCompany($space->company_id)->active()->ordered()->get());
    }
}
