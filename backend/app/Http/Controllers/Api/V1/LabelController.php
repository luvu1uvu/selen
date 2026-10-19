<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Labels\SaveLabelAction;
use App\Actions\Labels\SetLabelArchivedAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Labels\SaveLabelRequest;
use App\Http\Resources\LabelResource;
use App\Models\Label;
use App\Models\Space;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Метки в пространстве: список (общие метки компании и метки пространства, включая архивные —
 * они остаются на карточках) и управление метками пространства.
 */
class LabelController extends Controller
{
    public function index(Space $space): AnonymousResourceCollection
    {
        Gate::authorize('view', $space);

        return LabelResource::collection(Label::query()->availableIn($space)->ordered()->get());
    }

    public function store(SaveLabelRequest $request, Space $space, SaveLabelAction $action): JsonResponse
    {
        $label = $action->handle($request->user(), $request->validated(), space: $space);

        return (new LabelResource($label))->response()->setStatusCode(201);
    }

    /** Изменение любой метки: общей — системный администратор, пространства — его администратор. */
    public function update(SaveLabelRequest $request, Label $label, SaveLabelAction $action): LabelResource
    {
        return new LabelResource($action->handle($request->user(), $request->validated(), $label));
    }

    public function archive(Request $request, Label $label, SetLabelArchivedAction $action): LabelResource
    {
        Gate::authorize('manage', $label);

        return new LabelResource($action->handle($request->user(), $label, true));
    }

    public function restore(Request $request, Label $label, SetLabelArchivedAction $action): LabelResource
    {
        Gate::authorize('manage', $label);

        return new LabelResource($action->handle($request->user(), $label, false));
    }
}
