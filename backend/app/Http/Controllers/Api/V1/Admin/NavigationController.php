<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Navigation\CreateFolderAction;
use App\Actions\Navigation\DeleteFolderAction;
use App\Actions\Navigation\MoveNavNodeAction;
use App\Actions\Navigation\SetFolderArchivedAction;
use App\Actions\Navigation\UpdateNavNodeAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\MoveNavNodeRequest;
use App\Http\Requests\Admin\RestoreFolderRequest;
use App\Http\Requests\Admin\StoreFolderRequest;
use App\Http\Requests\Admin\UpdateNavNodeRequest;
use App\Models\Company;
use App\Models\NavNode;
use App\Services\Navigation\NavigationTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Админка «Структура» (ADR-0013): полное дерево с архивом, папки, перемещения, иконки. Только системный
 * администратор. Каждое изменение отвечает обновлённым деревом — клиенту не нужно пересчитывать его сам.
 */
class NavigationController extends Controller
{
    public function index(Company $company, NavigationTree $tree): JsonResponse
    {
        Gate::authorize('manage', [NavNode::class, $company]);

        return $this->tree($tree, $company);
    }

    public function storeFolder(StoreFolderRequest $request, Company $company, CreateFolderAction $action, NavigationTree $tree): JsonResponse
    {
        $folder = $action->handle(
            $request->user(),
            $company,
            $request->validated('name'),
            $request->validated('icon'),
            $request->validated('parent_id'),
        );

        return $this->tree($tree, $company, ['created_id' => $folder->id])->setStatusCode(201);
    }

    public function update(UpdateNavNodeRequest $request, Company $company, NavNode $node, UpdateNavNodeAction $action, NavigationTree $tree): JsonResponse
    {
        $action->handle($request->user(), $node, $request->validated());

        return $this->tree($tree, $company);
    }

    public function archive(Request $request, Company $company, NavNode $node, SetFolderArchivedAction $action, NavigationTree $tree): JsonResponse
    {
        Gate::authorize('update', $node);

        $action->handle($request->user(), $node, true);

        return $this->tree($tree, $company);
    }

    /** Удалить пустую папку навсегда (LATER-43); ответ — обновлённое полное дерево. */
    public function destroyFolder(Request $request, Company $company, NavNode $node, DeleteFolderAction $action, NavigationTree $tree): JsonResponse
    {
        Gate::authorize('delete', $node);

        $action->handle($request->user(), $node);

        return $this->tree($tree, $company);
    }

    public function restore(RestoreFolderRequest $request, Company $company, NavNode $node, SetFolderArchivedAction $action, NavigationTree $tree): JsonResponse
    {
        $action->handle($request->user(), $node, false, $request->boolean('restore_spaces'));

        return $this->tree($tree, $company);
    }

    public function move(MoveNavNodeRequest $request, Company $company, NavNode $node, MoveNavNodeAction $action, NavigationTree $tree): JsonResponse
    {
        $action->handle(
            $request->user(),
            $node,
            $request->validated('parent_id'),
            $request->validated('after_id'),
            $request->validated('before_id'),
        );

        return $this->tree($tree, $company);
    }

    /** @param  array<string, mixed>  $meta */
    private function tree(NavigationTree $tree, Company $company, array $meta = []): JsonResponse
    {
        return response()->json([
            'data' => $tree->forAdmin($company),
            'meta' => ['max_depth' => NavNode::MAX_FOLDER_DEPTH] + $meta,
        ]);
    }
}
