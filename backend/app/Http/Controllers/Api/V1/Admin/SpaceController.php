<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Spaces\ArchiveSpaceAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Actions\Spaces\DeleteSpaceAction;
use App\Actions\Spaces\RestoreSpaceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreSpaceRequest;
use App\Http\Resources\AdminSpaceResource;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\SpaceAccess;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Пространства в админке: системный администратор видит все пространства (метаданные),
 * создаёт, архивирует и назначает роли. Содержимое пространства ему недоступно без своей роли.
 */
class SpaceController extends Controller
{
    public function __construct(private readonly AccessResolver $resolver) {}

    public function index(Request $request, Company $company): AnonymousResourceCollection
    {
        Gate::authorize('adminViewAny', [Space::class, $company]);

        /** @var User $actor */
        $actor = $request->user();
        $accesses = Space::accessesOf($actor);

        // Пространства без действующего администратора — первыми (решение PM этапа 3)
        $spaces = $this->withAdminData(Space::query()->inCompany($company))
            ->orderBy('has_active_admin')
            ->orderBy('name')
            ->get()
            ->each(fn (Space $space) => $space->rememberAccess($actor, $accesses[$space->id] ?? SpaceAccess::none()));

        return AdminSpaceResource::collection($this->withAdmins($spaces));
    }

    public function store(StoreSpaceRequest $request, Company $company, CreateSpaceAction $action): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $adminIds = $request->validated('admin_ids') ?? [$actor->id];
        $admins = User::query()->whereIn('id', $adminIds)->get()
            ->sortBy(fn (User $user) => array_search($user->id, $adminIds, true))
            ->values()
            ->all();

        $space = $action->handle(
            $actor,
            $company,
            $request->safe()->only(['name', 'key', 'description']),
            $admins,
            $request->validated('icon'),
            $request->validated('parent_id'),
        );

        return (new AdminSpaceResource($this->reload($space)))->response()->setStatusCode(201);
    }

    public function archive(Request $request, Company $company, Space $space, ArchiveSpaceAction $action): AdminSpaceResource
    {
        Gate::authorize('archive', $space);

        return new AdminSpaceResource($this->reload($action->handle($request->user(), $space)));
    }

    /** Удалить пустое пространство навсегда (LATER-43). */
    public function destroy(Request $request, Company $company, Space $space, DeleteSpaceAction $action): Response
    {
        Gate::authorize('delete', $space);

        $action->handle($request->user(), $space);

        return response()->noContent();
    }

    public function restore(Request $request, Company $company, Space $space, RestoreSpaceAction $action): AdminSpaceResource
    {
        Gate::authorize('restore', $space);

        return new AdminSpaceResource($this->reload($action->handle($request->user(), $space)));
    }

    /** Назначить роль в пространстве себе или другому пользователю (пишется в журнал). */
    /**
     * Счётчики личных выдач и выдач группам, флаг действующего администратора (права — из AccessResolver).
     *
     * @param  Builder<Space>  $query
     * @return Builder<Space>
     */
    private function withAdminData($query)
    {
        $managed = $this->resolver->managedSpaceIds();

        return $query
            ->withGrantCounts()
            // Подзапрос считается один раз, а не на каждую строку (управляющие — и через папки, П2d-1)
            ->selectRaw('spaces.id IN ('.$managed->toSql().') AS has_active_admin', $managed->getBindings())
            ->with('navNode');
    }

    /**
     * Личные администраторы пространств одним запросом.
     *
     * @param  Collection<int, Space>  $spaces
     * @return Collection<int, Space>
     */
    private function withAdmins(Collection $spaces): Collection
    {
        $admins = $this->resolver->personalManagers($spaces->modelKeys());

        return $spaces->each(fn (Space $space) => $space->setRelation('admins', collect($admins->get($space->id, []))));
    }

    /** Свежий экземпляр: роли и состав участников могли измениться в этом запросе. */
    private function reload(Space $space): Space
    {
        /** @var Space $fresh */
        $fresh = $this->withAdmins(new Collection([$this->withAdminData(Space::query())->findOrFail($space->id)]))->first();

        return $fresh;
    }
}
