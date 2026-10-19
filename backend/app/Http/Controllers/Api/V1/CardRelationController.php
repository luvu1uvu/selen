<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\CardRelations\AddCardRelationAction;
use App\Actions\CardRelations\RemoveCardRelationAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\StoreCardRelationRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use App\Models\CardRelation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Связи «родитель — дочерняя». Меняют editor и admin; ответ — карточка целиком. */
class CardRelationController extends Controller
{
    public function store(StoreCardRelationRequest $request, Card $card, AddCardRelationAction $action): CardResource
    {
        $action->handle($request->user(), $card, $request->relatedCard(), $request->validated('kind'));

        return new CardResource($card->loadDetails());
    }

    public function destroy(Request $request, Card $card, CardRelation $relation, RemoveCardRelationAction $action): CardResource
    {
        Gate::authorize('update', $card);
        if ($relation->parent_id !== $card->id && $relation->child_id !== $card->id) {
            abort(404);
        }

        $action->handle($request->user(), $card, $relation);

        return new CardResource($card->loadDetails());
    }
}
