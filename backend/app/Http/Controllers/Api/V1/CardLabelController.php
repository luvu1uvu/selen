<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Cards\SyncCardLabelsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\SyncCardLabelsRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;

/** Метки карточки — заменяются целиком. */
class CardLabelController extends Controller
{
    public function update(SyncCardLabelsRequest $request, Card $card, SyncCardLabelsAction $action): CardResource
    {
        $card = $action->handle($request->user(), $card, $request->validated('label_ids'));

        return new CardResource($card->loadDetails());
    }
}
