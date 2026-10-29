<?php

namespace App\Actions\Access;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Папки и пространства компании, где человек может выдать доступ при приглашении и добавлении гостя (аудит Kaiten, П2c;
 * папки — П2d-1): все действующие (папка не в архиве, пространство не в архиве) — у кого право компании «управлять
 * доступом» (администратор компании, Владелец), иначе — те, где у него «управление доступом» к этому узлу (лично, через
 * группу или через папку выше). Права — только из Company::permissionsOf и NavNode::accessesOf.
 */
class GrantableNodes
{
    /**
     * Узлы в порядке дерева (папка, затем её содержимое) с уровнем: корень — 1.
     *
     * @return Collection<int, array{node: NavNode, depth: int}>
     */
    public function of(User $actor, Company $company): Collection
    {
        $nodes = NavNode::query()->inCompany($company)->with('space')->orderBy('position')->get();
        $children = $nodes->groupBy(fn (NavNode $node) => $node->parent_id ?? '');
        $all = $company->permissionsOf($actor)->allows(Permission::CompanyManageAccess);
        $accesses = $all ? collect() : NavNode::accessesOf($actor);
        $result = collect();

        $walk = function (string $parent, int $depth) use (&$walk, $children, $all, $accesses, $result): void {
            foreach ($children->get($parent, collect()) as $node) {
                /** @var NavNode $node */
                if (! $this->active($node)) {
                    continue;
                }
                if ($all || ($accesses->get($node->id)?->allows($this->permission($node)) ?? false)) {
                    $result->push(['node' => $node, 'depth' => $depth]);
                }
                if ($node->isFolder()) {
                    $walk($node->id, $depth + 1);
                }
            }
        };
        $walk('', 1);

        return $result;
    }

    public function allows(User $actor, NavNode $node, Company $company): bool
    {
        return $node->company_id === $company->id && $this->active($node)
            && ($company->permissionsOf($actor)->allows(Permission::CompanyManageAccess)
                || $node->accessOf($actor)->allows($this->permission($node)));
    }

    private function active(NavNode $node): bool
    {
        return $node->isFolder() ? ! $node->isArchived() : ($node->space !== null && ! $node->space->isArchived());
    }

    /** Право «управление доступом» к узлу: к папке — папочное, к пространству — пространства. */
    private function permission(NavNode $node): Permission
    {
        return $node->isFolder() ? Permission::FolderManageAccess : Permission::SpaceManageAccess;
    }
}
