<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\CardTypes\SaveCardTypeAction;
use App\Actions\CardTypes\SetCardTypeArchivedAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveCardTypeRequest;
use App\Http\Resources\CardTypeResource;
use App\Models\CardType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/** Справочник типов карточек (включая архивные) — только системный администратор. */
class CardTypeController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('manage', CardType::class);

        return CardTypeResource::collection(CardType::query()->ordered()->get());
    }

    public function store(SaveCardTypeRequest $request, SaveCardTypeAction $action): JsonResponse
    {
        $type = $action->handle($request->user(), $request->validated());

        return (new CardTypeResource($type))->response()->setStatusCode(201);
    }

    public function update(SaveCardTypeRequest $request, CardType $cardType, SaveCardTypeAction $action): CardTypeResource
    {
        return new CardTypeResource($action->handle($request->user(), $request->validated(), $cardType));
    }

    public function archive(Request $request, CardType $cardType, SetCardTypeArchivedAction $action): CardTypeResource
    {
        Gate::authorize('manage', $cardType);

        return new CardTypeResource($action->handle($request->user(), $cardType, true));
    }

    public function restore(Request $request, CardType $cardType, SetCardTypeArchivedAction $action): CardTypeResource
    {
        Gate::authorize('manage', $cardType);

        return new CardTypeResource($action->handle($request->user(), $cardType, false));
    }
}
