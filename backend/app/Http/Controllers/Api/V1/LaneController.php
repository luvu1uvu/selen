<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Lanes\ArchiveLaneAction;
use App\Actions\Lanes\CreateLaneAction;
use App\Actions\Lanes\MoveLaneAction;
use App\Actions\Lanes\RenameLaneAction;
use App\Actions\Lanes\SetLaneCollapsedAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boards\MoveStructureRequest;
use App\Http\Requests\Boards\RenameStructureRequest;
use App\Http\Requests\Boards\SetLaneCollapsedRequest;
use App\Http\Requests\Boards\StoreLaneRequest;
use App\Models\Board;
use App\Models\Lane;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/** Дорожки доски. После изменения клиент перечитывает доску. */
class LaneController extends Controller
{
    public function store(StoreLaneRequest $request, Board $board, CreateLaneAction $action): JsonResponse
    {
        $lane = $action->handle(
            $request->user(),
            $board,
            $request->validated('name'),
            $request->validated('after_id'),
            $request->validated('before_id'),
        );

        return response()->json(['data' => $this->summary($lane)], 201);
    }

    public function update(RenameStructureRequest $request, Lane $lane, RenameLaneAction $action): JsonResponse
    {
        return response()->json(['data' => $this->summary($action->handle($request->user(), $lane, $request->validated('name')))]);
    }

    public function move(MoveStructureRequest $request, Lane $lane, MoveLaneAction $action): JsonResponse
    {
        $lane = $action->handle($request->user(), $lane, $request->validated('after_id'), $request->validated('before_id'));

        return response()->json(['data' => $this->summary($lane)]);
    }

    public function archive(Request $request, Lane $lane, ArchiveLaneAction $action): JsonResponse
    {
        Gate::authorize('manage', $lane);

        return response()->json(['data' => $this->summary($action->handle($request->user(), $lane))]);
    }

    /** Свернуть дорожку у себя (личный вид, ADR-0019). */
    public function collapse(SetLaneCollapsedRequest $request, Lane $lane, SetLaneCollapsedAction $action): Response
    {
        $action->handle($request->user(), $lane, true);

        return response()->noContent();
    }

    /** Развернуть дорожку у себя. */
    public function expand(SetLaneCollapsedRequest $request, Lane $lane, SetLaneCollapsedAction $action): Response
    {
        $action->handle($request->user(), $lane, false);

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function summary(Lane $lane): array
    {
        return [
            'id' => $lane->id,
            'board_id' => $lane->board_id,
            'name' => $lane->name,
            'position' => $lane->position,
            'archived_at' => $lane->archived_at?->toIso8601ZuluString(),
        ];
    }
}
