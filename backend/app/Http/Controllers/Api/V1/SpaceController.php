<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Spaces\UpdateSpaceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Spaces\UpdateSpaceRequest;
use App\Http\Resources\SpaceResource;
use App\Models\Space;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class SpaceController extends Controller
{
    /** Пространства, к которым у пользователя есть доступ (без архивных), с активными досками: для сайдбара. */
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();
        $accesses = Space::accessesOf($user);

        $spaces = Space::query()
            ->whereIn('id', $accesses->keys())
            ->active()
            ->with(['boards' => fn ($q) => $q->active()->inLayoutOrder()])
            ->orderBy('name')
            ->get()
            ->each(fn (Space $space) => $space->rememberAccess($user, $accesses[$space->id]));

        return SpaceResource::collection($spaces);
    }

    public function show(Space $space): SpaceResource
    {
        Gate::authorize('view', $space);

        return new SpaceResource($space);
    }

    public function update(UpdateSpaceRequest $request, Space $space, UpdateSpaceAction $action): SpaceResource
    {
        return new SpaceResource($action->handle($request->user(), $space, $request->validated()));
    }
}
