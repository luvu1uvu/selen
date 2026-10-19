<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\CardBlocks\BlockCardAction;
use App\Actions\CardBlocks\UnblockCardAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\StoreCardBlockRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use App\Models\CardBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Блокировки карточки (ADR-0011). Ставят и снимают editor и admin; ответ — карточка целиком. */
class CardBlockController extends Controller
{
    public function store(StoreCardBlockRequest $request, Card $card, BlockCardAction $action): JsonResponse
    {
        $action->handle($request->user(), $card, $request->validated('reason'), $request->byCard(), $request->blockingCard());

        return (new CardResource($card->loadDetails()))->response()->setStatusCode(201);
    }

    public function resolve(Request $request, CardBlock $block, UnblockCardAction $action): CardResource
    {
        Gate::authorize('update', $block->card);
        $action->handle($request->user(), $block);

        return new CardResource($block->card->loadDetails());
    }
}
