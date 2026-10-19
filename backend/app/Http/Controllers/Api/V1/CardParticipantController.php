<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Cards\AddCardParticipantAction;
use App\Actions\Cards\RemoveCardParticipantAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\AddCardParticipantRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Участники карточки (заказчик и ответственный меняются через PATCH cards/{card}). */
class CardParticipantController extends Controller
{
    public function store(AddCardParticipantRequest $request, Card $card, AddCardParticipantAction $action): CardResource
    {
        $user = User::query()->findOrFail($request->validated('user_id'));

        return new CardResource($action->handle($request->user(), $card, $user)->loadDetails());
    }

    public function destroy(Request $request, Card $card, User $user, RemoveCardParticipantAction $action): CardResource
    {
        Gate::authorize('update', $card);

        return new CardResource($action->handle($request->user(), $card, $user)->loadDetails());
    }
}
