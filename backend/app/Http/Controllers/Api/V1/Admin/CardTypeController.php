<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\CardTypes\SaveCardTypeAction;
use App\Actions\CardTypes\SetCardTypeArchivedAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveCardTypeRequest;
use App\Http\Resources\CardTypeResource;
use App\Models\CardType;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/** Справочник типов карточек компании (включая архивные) — право компании «управлять справочниками». */
class CardTypeController extends Controller
{
    public function index(Company $company): AnonymousResourceCollection
    {
        Gate::authorize('manage', [CardType::class, $company]);

        return CardTypeResource::collection(CardType::query()->inCompany($company)->ordered()->get());
    }

    public function store(SaveCardTypeRequest $request, Company $company, SaveCardTypeAction $action): JsonResponse
    {
        $type = $action->handle($request->user(), $company, $request->validated());

        return (new CardTypeResource($type))->response()->setStatusCode(201);
    }

    public function update(SaveCardTypeRequest $request, Company $company, CardType $cardType, SaveCardTypeAction $action): CardTypeResource
    {
        return new CardTypeResource($action->handle($request->user(), $company, $request->validated(), $cardType));
    }

    public function archive(Request $request, Company $company, CardType $cardType, SetCardTypeArchivedAction $action): CardTypeResource
    {
        Gate::authorize('manage', [CardType::class, $company]);

        return new CardTypeResource($action->handle($request->user(), $cardType, true));
    }

    public function restore(Request $request, Company $company, CardType $cardType, SetCardTypeArchivedAction $action): CardTypeResource
    {
        Gate::authorize('manage', [CardType::class, $company]);

        return new CardTypeResource($action->handle($request->user(), $cardType, false));
    }
}
