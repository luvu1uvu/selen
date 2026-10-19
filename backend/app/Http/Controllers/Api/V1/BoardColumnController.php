<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Columns\ArchiveColumnAction;
use App\Actions\Columns\ChangeColumnCategoryAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Columns\MoveColumnAction;
use App\Actions\Columns\RenameColumnAction;
use App\Enums\ColumnCategory;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boards\ChangeColumnCategoryRequest;
use App\Http\Requests\Boards\MoveStructureRequest;
use App\Http\Requests\Boards\RenameStructureRequest;
use App\Http\Requests\Boards\StoreColumnRequest;
use App\Models\Board;
use App\Models\BoardColumn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Колонки доски. Ответ — короткий: после изменения структуры клиент перечитывает доску целиком.
 */
class BoardColumnController extends Controller
{
    public function store(StoreColumnRequest $request, Board $board, CreateColumnAction $action): JsonResponse
    {
        $parentId = $request->validated('parent_id');

        $column = $action->handle(
            $request->user(),
            $board,
            $request->validated('name'),
            $request->enum('category', ColumnCategory::class),
            $parentId === null ? null : BoardColumn::query()->findOrFail($parentId),
            $request->validated('after_id'),
            $request->validated('before_id'),
        );

        return response()->json(['data' => $this->summary($column)], 201);
    }

    public function update(RenameStructureRequest $request, BoardColumn $column, RenameColumnAction $action): JsonResponse
    {
        return response()->json(['data' => $this->summary($action->handle($request->user(), $column, $request->validated('name')))]);
    }

    public function move(MoveStructureRequest $request, BoardColumn $column, MoveColumnAction $action): JsonResponse
    {
        $column = $action->handle($request->user(), $column, $request->validated('after_id'), $request->validated('before_id'));

        return response()->json(['data' => $this->summary($column)]);
    }

    /** Смена типа: в ответе — сколько карточек сменили статус. */
    public function category(ChangeColumnCategoryRequest $request, BoardColumn $column, ChangeColumnCategoryAction $action): JsonResponse
    {
        $affected = $action->handle($request->user(), $column, $request->enum('category', ColumnCategory::class));

        return response()->json(['data' => [...$this->summary($column->refresh()), 'cards_affected' => $affected]]);
    }

    public function archive(Request $request, BoardColumn $column, ArchiveColumnAction $action): JsonResponse
    {
        Gate::authorize('manage', $column);

        return response()->json(['data' => $this->summary($action->handle($request->user(), $column))]);
    }

    /** @return array<string, mixed> */
    private function summary(BoardColumn $column): array
    {
        return [
            'id' => $column->id,
            'board_id' => $column->board_id,
            'parent_id' => $column->parent_id,
            'name' => $column->name,
            'category' => $column->category,
            'position' => $column->position,
            'archived_at' => $column->archived_at?->toIso8601ZuluString(),
        ];
    }
}
