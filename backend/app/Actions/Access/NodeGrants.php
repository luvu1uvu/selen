<?php

namespace App\Actions\Access;

use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

/**
 * Строки выдач субъекта на узле дерева для Actions доступа (docs/adr/0024-rights-2.md, П2d-1): у субъекта (человек или
 * группа) на узле (папка или пространство) — набор ролей, каждая роль — своя строка access_grants (уникальность «узел ×
 * субъект × роль» — в БД). Права по выдачам вычисляет только AccessResolver; здесь — только строки.
 */
class NodeGrants
{
    /**
     * Выдачи субъекта на узле (с ролями), по порядку выдачи.
     *
     * @return Collection<int, AccessGrant>
     */
    public function of(NavNode $node, User|Group $subject): Collection
    {
        return AccessGrant::query()
            ->where('nav_node_id', $node->getKey())
            ->where($subject instanceof User ? 'user_id' : 'group_id', $subject->getKey())
            ->with('role')
            ->orderBy('id')
            ->get();
    }

    /**
     * Выдачи на узел и на все папки над ним — для показа «Доступа…» и «Групп» пространства (унаследованные — с узлом
     * выдачи), с людьми, группами и ролями. Права по ним считает только AccessResolver.
     *
     * @return Collection<int, AccessGrant>
     */
    public function onPath(NavNode $node): Collection
    {
        $path = $node->pathIds();

        return AccessGrant::query()
            ->whereIn('nav_node_id', $path)
            ->with(['user', 'group' => fn ($q) => $q->withCount('members'), 'role', 'navNode.space'])
            ->orderBy('id')
            ->get()
            // Сначала выдачи на сам узел, затем — от ближней папки к дальней
            ->sortBy(fn (AccessGrant $grant) => array_search($grant->nav_node_id, $path, true))
            ->values();
    }

    /**
     * Сделать набор ролей субъекта на узле равным $roles: недостающие роли выдаются, лишние снимаются. Возвращает
     * выданные и снятые роли.
     *
     * @param  list<Role>  $roles
     * @return array{added: list<Role>, removed: list<Role>}
     */
    public function sync(User $actor, NavNode $node, User|Group $subject, array $roles): array
    {
        $current = $this->of($node, $subject);
        $wanted = collect($roles)->keyBy('id');
        $added = [];
        $removed = [];

        foreach ($current as $grant) {
            if (! $wanted->has($grant->role_id)) {
                $removed[] = $grant->role;
                $grant->delete();
            }
        }

        $have = $current->pluck('role_id')->flip();
        foreach ($wanted as $role) {
            if (! $have->has($role->id)) {
                AccessGrant::query()->forceCreate([
                    // Выдача — в компании узла (составные FK: узел и группа — той же компании)
                    'company_id' => $node->company_id,
                    'nav_node_id' => $node->getKey(),
                    'user_id' => $subject instanceof User ? $subject->getKey() : null,
                    'group_id' => $subject instanceof Group ? $subject->getKey() : null,
                    'role_id' => $role->id,
                    'granted_by' => $actor->getKey(),
                ]);
                $added[] = $role;
            }
        }

        return ['added' => $added, 'removed' => $removed];
    }

    /**
     * Значение роли для журнала и API: ключ стандартной роли, у пользовательской (П2e) — её id.
     */
    public static function value(Role $role): string
    {
        return $role->key->value ?? $role->id;
    }

    /**
     * Значения ролей в порядке списка ролей (как в выборе ролей).
     *
     * @param  iterable<Role>  $roles
     * @return list<string>
     */
    public static function values(iterable $roles): array
    {
        return collect($roles)
            ->sortBy(fn (Role $role) => [$role->company_id === null ? 0 : 1, $role->position, $role->id])
            ->map(fn (Role $role) => self::value($role))
            ->values()
            ->all();
    }
}
