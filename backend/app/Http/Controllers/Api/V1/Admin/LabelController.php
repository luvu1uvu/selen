<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Labels\SaveLabelAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Labels\SaveLabelRequest;
use App\Http\Resources\LabelResource;
use App\Models\Company;
use App\Models\Label;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Общие метки компании (включая архивные) — право компании «управлять справочниками» (ADR-0024).
 * Изменение и архив — общие маршруты labels/{id} (Api\V1\LabelController).
 */
class LabelController extends Controller
{
    public function index(Company $company): AnonymousResourceCollection
    {
        Gate::authorize('manageCompanyLabels', [Label::class, $company]);

        return LabelResource::collection(Label::query()->inCompany($company)->whereNull('space_id')->ordered()->get());
    }

    public function store(SaveLabelRequest $request, Company $company, SaveLabelAction $action): JsonResponse
    {
        $label = $action->handle($request->user(), $request->validated(), company: $company);

        return (new LabelResource($label))->response()->setStatusCode(201);
    }
}
