<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\CardLinks\AddCardLinkAction;
use App\Actions\CardLinks\RemoveCardLinkAction;
use App\Actions\CardLinks\UpdateCardLinkAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\SaveCardLinkRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use App\Models\CardLink;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Ссылки в карточке. Меняют editor и admin; ответ — карточка целиком. */
class CardLinkController extends Controller
{
    public function store(SaveCardLinkRequest $request, Card $card, AddCardLinkAction $action): CardResource
    {
        $action->handle($request->user(), $card, $request->validated());

        return new CardResource($card->loadDetails());
    }

    public function update(SaveCardLinkRequest $request, CardLink $link, UpdateCardLinkAction $action): CardResource
    {
        $action->handle($request->user(), $link, $request->validated());

        return new CardResource($link->card->loadDetails());
    }

    public function destroy(Request $request, CardLink $link, RemoveCardLinkAction $action): CardResource
    {
        Gate::authorize('update', $link->card);
        $action->handle($request->user(), $link);

        return new CardResource($link->card->loadDetails());
    }
}
