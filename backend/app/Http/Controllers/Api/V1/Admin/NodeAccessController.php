<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Access\NodeGrants;
use App\Actions\Access\RevokeNodeAccessAction;
use App\Actions\Access\SetNodeAccessAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SetNodeAccessRequest;
use App\Http\Resources\NodeAccessResource;
use App\Models\Company;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * «Доступ…» папки и пространства в «Структуре» и меню «⋯» дерева (docs/adr/0024-rights-2.md, П2d-1): кто и с какими
 * ролями; унаследованные с папок выше — с пометкой «через папку X» (меняются на той папке). Ведёт тот, у кого право
 * компании «управлять доступом» (администратор компании, Владелец, выданное лично или группе); права «Администратора»
 * на папки ролью — П2d-2. Здесь же «Сущности» группы и роль человека из «Пространств» админки — те же выдачи.
 * Человек и группа в адресе — люди и группы компании (scoped binding): другой компании — 404.
 */
class NodeAccessController extends Controller
{
    /** Пометка выдач из админки в журнале (как у прежних «Пространств» и страницы группы). */
    public const VIA = 'admin_panel';

    public function show(Company $company, NavNode $node, NodeGrants $grants): NodeAccessResource
    {
        Gate::authorize('manageAccess', $node);

        return new NodeAccessResource(['node' => $node->load('space'), 'grants' => $grants->onPath($node)]);
    }

    public function setUser(SetNodeAccessRequest $request, Company $company, NavNode $node, User $user, SetNodeAccessAction $action, NodeGrants $grants): NodeAccessResource
    {
        $action->handle($request->user(), $node, $user, $request->roles(), self::VIA);

        return new NodeAccessResource(['node' => $node->load('space'), 'grants' => $grants->onPath($node)]);
    }

    public function revokeUser(Request $request, Company $company, NavNode $node, User $user, RevokeNodeAccessAction $action): Response
    {
        Gate::authorize('manageAccess', $node);

        $action->handle($request->user(), $node, $user, self::VIA);

        return response()->noContent();
    }

    public function setGroup(SetNodeAccessRequest $request, Company $company, NavNode $node, Group $group, SetNodeAccessAction $action, NodeGrants $grants): NodeAccessResource
    {
        $action->handle($request->user(), $node, $group, $request->roles(), self::VIA);

        return new NodeAccessResource(['node' => $node->load('space'), 'grants' => $grants->onPath($node)]);
    }

    public function revokeGroup(Request $request, Company $company, NavNode $node, Group $group, RevokeNodeAccessAction $action): Response
    {
        Gate::authorize('manageAccess', $node);

        $action->handle($request->user(), $node, $group, self::VIA);

        return response()->noContent();
    }
}
