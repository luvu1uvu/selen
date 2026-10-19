<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Labels\SaveLabelAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Labels\SaveLabelRequest;
use App\Http\Resources\LabelResource;
use App\Models\Label;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Общие метки компании (включая архивные) — только системный администратор.
 * Изменение и архив — общие маршруты labels/{id} (Api\V1\LabelController).
 */
class LabelController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('manageCompanyLabels', Label::class);

        return LabelResource::collection(Label::query()->whereNull('space_id')->ordered()->get());
    }

    public function store(SaveLabelRequest $request, SaveLabelAction $action): JsonResponse
    {
        $label = $action->handle($request->user(), $request->validated());

        return (new LabelResource($label))->response()->setStatusCode(201);
    }
}
