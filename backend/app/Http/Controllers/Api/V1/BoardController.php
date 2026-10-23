<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Boards\MoveBoardAction;
use App\Actions\Boards\SetBoardArchivedAction;
use App\Actions\Boards\SetBoardCollapsedAction;
use App\Actions\Boards\UpdateBoardAction;
use App\Enums\BoardTemplate;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boards\MoveBoardRequest;
use App\Http\Requests\Boards\SetBoardCollapsedRequest;
use App\Http\Requests\Boards\StoreBoardRequest;
use App\Http\Requests\Boards\UpdateBoardRequest;
use App\Http\Resources\BoardDetailResource;
use App\Http\Resources\BoardResource;
use App\Http\Resources\CardSummaryResource;
use App\Models\Board;
use App\Models\Card;
use App\Models\Space;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

class BoardController extends Controller
{
    /**
     * Все доски пространства, включая архивные, в порядке раскладки (ряд, затем место в ряду; ADR-0019) — для страницы
     * пространства. Без карточек: ширина доски — по числу листовых колонок, у свёрнутой — счётчик видимых пользователю
     * активных карточек (CardVisibility, ADR-0008) и личный признак сворачивания. Запросов — постоянное число на любое
     * число досок.
     */
    public function index(Request $request, Space $space, CardVisibility $visibility): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);
        /** @var User $user */
        $user = $request->user();

        $boards = $space->boards()
            ->inLayoutOrder()
            ->withCount(['columns as leaf_columns_count' => fn ($q) => $q->active()
                ->whereDoesntHave('children', fn ($children) => $children->active())])
            ->get();
        $cards = $visibility->scope(Card::query()->where('space_id', $space->id), $user, $space)
            ->active()
            ->toBase()
            ->selectRaw('board_id, count(*) as aggregate')
            ->groupBy('board_id')
            ->pluck('aggregate', 'board_id');
        $collapsed = $user->collapsedBoards()->where('boards.space_id', $space->id)->pluck('boards.id')->flip();

        foreach ($boards as $board) {
            $board->setAttribute('cards_count', (int) ($cards[$board->id] ?? 0));
            $board->setAttribute('collapsed', $collapsed->has($board->id));
        }

        return BoardResource::collection($boards);
    }

    public function store(StoreBoardRequest $request, Space $space, CreateBoardAction $action): JsonResponse
    {
        $board = $action->handle(
            $request->user(),
            $space,
            $request->safe()->only(['name', 'description']),
            $request->enum('template', BoardTemplate::class),
        );

        return (new BoardResource($board))->response()->setStatusCode(201);
    }

    public function show(Request $request, Board $board, CardVisibility $visibility): BoardDetailResource
    {
        Gate::authorize('view', $board);

        return new BoardDetailResource($this->withContent($board, $request->user(), $visibility));
    }

    public function update(UpdateBoardRequest $request, Board $board, UpdateBoardAction $action): BoardResource
    {
        return new BoardResource($action->handle($request->user(), $board, $request->validated()));
    }

    /** Перестановка доски в раскладке её пространства: в ряд, отдельным рядом или рядом с соседом (ADR-0019). */
    public function move(MoveBoardRequest $request, Board $board, MoveBoardAction $action): BoardResource
    {
        return new BoardResource($action->handle(
            $request->user(),
            $board,
            $request->validated('after_id'),
            $request->validated('before_id'),
            rowId: $request->validated('row_id'),
            newRow: $request->wantsNewRow(),
            newRowAfterId: $request->validated('new_row_after_id'),
            newRowBeforeId: $request->validated('new_row_before_id'),
        ));
    }

    /** Свернуть доску у себя на странице пространства (личный вид, ADR-0019). */
    public function collapse(SetBoardCollapsedRequest $request, Board $board, SetBoardCollapsedAction $action): Response
    {
        $action->handle($request->user(), $board, true);

        return response()->noContent();
    }

    /** Развернуть доску у себя. */
    public function expand(SetBoardCollapsedRequest $request, Board $board, SetBoardCollapsedAction $action): Response
    {
        $action->handle($request->user(), $board, false);

        return response()->noContent();
    }

    public function archive(Request $request, Board $board, SetBoardArchivedAction $action): BoardResource
    {
        Gate::authorize('archive', $board);

        return new BoardResource($action->handle($request->user(), $board, true));
    }

    public function restore(Request $request, Board $board, SetBoardArchivedAction $action): BoardResource
    {
        Gate::authorize('restore', $board);

        return new BoardResource($action->handle($request->user(), $board, false));
    }

    /**
     * Архивные карточки доски (editor и admin): поиск по номеру или названию, недавно архивированные сверху.
     * Только видимые пользователю (ADR-0008). Восстановление — POST cards/{card}/restore.
     */
    public function archivedCards(Request $request, Board $board, CardVisibility $visibility): AnonymousResourceCollection
    {
        Gate::authorize('viewArchive', $board);
        $search = $request->validate(['search' => ['nullable', 'string', 'max:200']])['search'] ?? '';

        $cards = $visibility->scope($board->cards()->getQuery(), $request->user(), $board->space)
            ->whereNotNull('archived_at')
            ->when($search !== '', fn ($q) => $q->matching($search, $board->space))
            ->with(['column.parent'])
            ->orderByDesc('archived_at')
            ->orderByDesc('number')
            ->paginate(20)
            ->through(fn (Card $card) => $card->setRelation('space', $board->space)->setRelation('board', $board));

        return CardSummaryResource::collection($cards);
    }

    /**
     * Доска для отрисовки. Карточки — только видимые пользователю (режим «только свои карточки», ADR-0008):
     * счётчики колонок на клиенте считаются по этому же списку.
     */
    private function withContent(Board $board, User $user, CardVisibility $visibility): Board
    {
        // Тот же экземпляр пространства, что у политики: права пользователя уже вычислены (кеш accessOf)
        $board->loadMissing('space');

        return $board->load([
            'columns' => fn ($q) => $q->active()->orderBy('position'),
            'lanes' => fn ($q) => $q->active()->orderBy('position'),
            'cards' => fn ($q) => $visibility->scope($q->getQuery(), $user, $board->space)
                ->active()
                ->orderBy('position')
                ->with(['labels', 'responsible:id,name,status'])
                ->withCount([
                    'checklistItems as checklist_total',
                    'checklistItems as checklist_done' => fn ($q) => $q->where('is_done', true),
                    'comments' => fn ($q) => $q->whereNull('deleted_at'),
                    'attachments' => fn ($q) => $q->whereNull('deleted_at'),
                ])
                ->withExists([
                    'blocks as is_blocked' => fn ($q) => $q->whereNull('ended_at'),
                    // «Своя» карточка зрителя — для can_edit при источнике с ограничением (ADR-0012)
                    'participants as viewer_is_participant' => fn ($q) => $q->whereKey($user->id),
                ]),
        ]);
    }
}
