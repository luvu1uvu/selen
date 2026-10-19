<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Checklists\AddChecklistAction;
use App\Actions\Checklists\AddChecklistItemAction;
use App\Actions\Checklists\MoveChecklistItemAction;
use App\Actions\Checklists\RemoveChecklistAction;
use App\Actions\Checklists\RemoveChecklistItemAction;
use App\Actions\Checklists\RenameChecklistAction;
use App\Actions\Checklists\UpdateChecklistItemAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Checklists\SaveChecklistItemRequest;
use App\Http\Requests\Checklists\SaveChecklistRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use App\Models\Checklist;
use App\Models\ChecklistItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/** Чек-листы и их пункты. Меняют editor и admin; ответ — карточка целиком (панель обновляется сразу). */
class ChecklistController extends Controller
{
    public function store(SaveChecklistRequest $request, Card $card, AddChecklistAction $action): CardResource
    {
        $action->handle($request->user(), $card, $request->validated('title'));

        return new CardResource($card->loadDetails());
    }

    public function update(SaveChecklistRequest $request, Checklist $checklist, RenameChecklistAction $action): CardResource
    {
        $action->handle($request->user(), $checklist, $request->validated('title'));

        return new CardResource($checklist->card->loadDetails());
    }

    public function destroy(Request $request, Checklist $checklist, RemoveChecklistAction $action): CardResource
    {
        Gate::authorize('update', $checklist->card);
        $action->handle($request->user(), $checklist);

        return new CardResource($checklist->card->loadDetails());
    }

    public function storeItem(SaveChecklistItemRequest $request, Checklist $checklist, AddChecklistItemAction $action): CardResource
    {
        $action->handle($request->user(), $checklist, $request->validated('text'), $request->validated('after_id'));

        return new CardResource($checklist->card->loadDetails());
    }

    public function updateItem(SaveChecklistItemRequest $request, ChecklistItem $item, UpdateChecklistItemAction $action): CardResource
    {
        $action->handle($request->user(), $item, $request->safe()->only(['text', 'is_done']));

        return new CardResource($item->checklist->card->loadDetails());
    }

    public function moveItem(SaveChecklistItemRequest $request, ChecklistItem $item, MoveChecklistItemAction $action): CardResource
    {
        $action->handle($request->user(), $item, $request->validated('after_id'), $request->validated('before_id'));

        return new CardResource($item->checklist->card->loadDetails());
    }

    public function destroyItem(Request $request, ChecklistItem $item, RemoveChecklistItemAction $action): CardResource
    {
        $card = $item->checklist->card;
        Gate::authorize('update', $card);
        $action->handle($request->user(), $item);

        return new CardResource($card->loadDetails());
    }
}
