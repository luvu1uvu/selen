<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Cards\RestoreCardFromTrashAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\TrashedCardResource;
use App\Models\Card;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\SpaceAccess;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * «Администрирование → Корзина» (ADR-0015): удалённые карточки всех пространств, восстановление.
 * Название карточки — только из пространств, к которым у администратора есть доступ (TrashedCardResource).
 */
class TrashController extends Controller
{
    public function index(Request $request, Company $company): AnonymousResourceCollection
    {
        Gate::authorize('viewTrash', [Card::class, $company]);
        /** @var User $actor */
        $actor = $request->user();
        $accesses = Space::accessesOf($actor);

        // Только карточки пространств компании (ADR-0024)
        $cards = Card::onlyTrashed()
            ->whereIn('space_id', Space::query()->inCompany($company)->select('id'))
            // participants — для правила «только свои» (название — только тому, кто видел бы карточку)
            ->with(['space', 'board', 'deleter', 'participants:id'])
            ->orderByDesc('deleted_at')
            ->orderByDesc('id')
            ->paginate(20);
        $cards->getCollection()
            ->each(fn (Card $card) => $card->space->rememberAccess($actor, $accesses[$card->space_id] ?? SpaceAccess::none()));

        return TrashedCardResource::collection($cards);
    }

    public function restore(Request $request, Company $company, string $key, RestoreCardFromTrashAction $action): TrashedCardResource
    {
        Gate::authorize('restoreFromTrash', [Card::class, $company]);
        // Карточка другой компании — как несуществующая
        $card = Card::trashedByKey($key);
        if ($card === null || $card->space->company_id !== $company->id) {
            throw (new ModelNotFoundException)->setModel(Card::class);
        }

        return new TrashedCardResource($action->handle($request->user(), $card)->load(['space', 'board', 'deleter', 'participants:id']));
    }
}
