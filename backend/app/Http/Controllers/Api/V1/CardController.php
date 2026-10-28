<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\DeleteCardAction;
use App\Actions\Cards\MoveCardAction;
use App\Actions\Cards\SetCardArchivedAction;
use App\Actions\Cards\UpdateCardAction;
use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cards\MoveCardRequest;
use App\Http\Requests\Cards\StoreCardRequest;
use App\Http\Requests\Cards\UpdateCardRequest;
use App\Http\Resources\CardResource;
use App\Http\Resources\CardTransitionResource;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\Lane;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMembers;
use App\Services\Cards\CardHistory;
use App\Services\Cards\CardVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Карточки. В URL карточка адресуется номером: /api/v1/cards/DEV-123 (Card::resolveRouteBinding).
 */
class CardController extends Controller
{
    public function store(StoreCardRequest $request, Board $board, CreateCardAction $action): JsonResponse
    {
        $card = $action->handle(
            $request->user(),
            $board,
            $request->safe()->only(['title', 'card_type_id']),
            BoardColumn::query()->findOrFail($request->validated('column_id')),
            Lane::query()->findOrFail($request->validated('lane_id')),
            $request->validated('after_id'),
            $request->validated('before_id'),
        );

        return (new CardResource($card->loadDetails()))->response()->setStatusCode(201);
    }

    public function show(Card $card): CardResource
    {
        Gate::authorize('view', $card);

        return new CardResource($card->loadDetails());
    }

    public function update(UpdateCardRequest $request, Card $card, UpdateCardAction $action): CardResource
    {
        return new CardResource($action->handle($request->user(), $card, $request->validated())->loadDetails());
    }

    public function move(MoveCardRequest $request, Card $card, MoveCardAction $action): CardResource
    {
        $card = $action->handle(
            $request->user(),
            $card,
            BoardColumn::query()->findOrFail($request->validated('column_id')),
            Lane::query()->findOrFail($request->validated('lane_id')),
            $request->validated('after_id'),
            $request->validated('before_id'),
        );

        return new CardResource($card->loadDetails());
    }

    public function archive(Request $request, Card $card, SetCardArchivedAction $action): CardResource
    {
        Gate::authorize('move', $card);

        return new CardResource($action->handle($request->user(), $card, true)->loadDetails());
    }

    public function restore(Request $request, Card $card, SetCardArchivedAction $action): CardResource
    {
        Gate::authorize('move', $card);

        return new CardResource($action->handle($request->user(), $card, false)->loadDetails());
    }

    /** В корзину (ADR-0015). */
    public function destroy(Request $request, Card $card, DeleteCardAction $action): Response
    {
        Gate::authorize('delete', $card);
        $action->handle($request->user(), $card);

        return response()->noContent();
    }

    /** История перемещений карточки (card_transitions) — от старых к новым. */
    public function transitions(Card $card): AnonymousResourceCollection
    {
        Gate::authorize('view', $card);

        $transitions = $card->transitions()
            ->with(['actor', 'fromBoard', 'toBoard', 'fromColumn', 'toColumn', 'fromLane', 'toLane'])
            ->get();

        return CardTransitionResource::collection($transitions);
    }

    /** Лента истории: перемещения и изменения карточки по времени, новые сверху (CardHistory). */
    public function history(Request $request, Card $card, CardHistory $history): JsonResponse
    {
        Gate::authorize('view', $card);

        return response()->json($history->for($request->user(), $card->loadMissing('space'), $request));
    }

    /**
     * Кого можно упомянуть в описании или комментарии: тех, кто видит карточку (поправка PM A — то же правило,
     * что проверяет App\Rules\RichText), кроме деактивированных.
     */
    public function mentionable(Card $card, CardVisibility $visibility, AccessResolver $resolver): JsonResponse
    {
        Gate::authorize('view', $card);

        // Все, у кого есть доступ к пространству (лично или через группу, ADR-0012), — одним запросом
        $accesses = $resolver->usersWithAccess($card->space);

        $users = User::query()->whereIn('id', $accesses->keys())->where('status', '!=', UserStatus::Deactivated)->get()
            ->each(fn (User $user) => $card->space->rememberAccess($user, $accesses[$user->id]))
            ->filter(fn (User $user) => $visibility->canSee($user, $card))
            ->sortBy(fn (User $user) => mb_strtolower($user->name))
            ->values()
            // Гость — с бейджем (П2c)
            ->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'guest' => CompanyMembers::guestOf($user, $card->space->company_id) !== null]);

        return response()->json(['data' => $users]);
    }
}
