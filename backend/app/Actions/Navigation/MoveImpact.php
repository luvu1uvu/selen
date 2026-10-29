<?php

namespace App\Actions\Navigation;

use App\Models\Group;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Closure;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Что изменит «Переместить в…» в доступе (docs/adr/0024-rights-2.md, план 1.3, раздел 4): выдача на папку действует на
 * всё внутри, поэтому перемещение папки или пространства меняет унаследованный доступ. До подтверждения окно показывает,
 * кто получит и кто потеряет доступ к перемещаемому (к узлу или чему-то внутри), и какие пространства останутся без
 * того, кто управляет доступом (тогда перемещение — отказ 422).
 *
 * Считается точно: перемещение выполняется в транзакции, доступ поддерева сравнивается до и после, транзакция
 * откатывается — ни узел, ни журнал не меняются. Люди и группы — действующие (группа не в архиве, человек — действующий
 * участник компании и не деактивирован); права по выдачам считает AccessResolver. Тот же подсчёт (apply) решает при самом
 * перемещении, нужно ли право «управлять доступом» (решение PM 29.10).
 */
class MoveImpact
{
    public function __construct(
        private readonly AccessResolver $resolver,
        private readonly NavTreeGuard $tree,
    ) {}

    /**
     * @return array{gain: list<User|Group>, lose: list<User|Group>, unmanaged: Collection<int, Space>}
     */
    public function of(NavNode $node, ?string $parentId): array
    {
        if ($parentId === $node->parent_id) {
            return ['gain' => [], 'lose' => [], 'unmanaged' => new Collection];
        }

        DB::beginTransaction();
        try {
            // Под блокировкой дерева — те же проверки места, что у перемещения (цикл, глубина, архив): иначе параллельное
            // перемещение между проверкой и UPDATE могло бы замкнуть дерево в цикл (ревью П2d-1)
            NavNode::lockTree();
            $node = NavNode::query()->with(['space', 'company'])->findOrFail($node->getKey());
            $this->tree->ensureMovable($node, $parentId);
            $unmanagedBefore = $this->resolver->unmanagedSpaceIds($node);
            $changes = $this->apply($node, fn () => NavNode::query()->whereKey($node->getKey())->update(['parent_id' => $parentId]));
            $unmanaged = array_values(array_diff($this->resolver->unmanagedSpaceIds($node), $unmanagedBefore));
        } finally {
            DB::rollBack();
        }

        return $changes + ['unmanaged' => Space::query()->whereKey($unmanaged)->orderByRaw('lower(name)')->get()];
    }

    /**
     * Выполнить перемещение и вернуть, кто получил и кто потерял доступ к перемещаемому. Вызывать в транзакции под
     * блокировкой дерева.
     *
     * @param  Closure(): mixed  $move
     * @return array{gain: list<User|Group>, lose: list<User|Group>}
     */
    public function apply(NavNode $node, Closure $move): array
    {
        $before = $this->resolver->subtreeSubjects($node);
        $move();
        $after = $this->resolver->subtreeSubjects($node);

        return [
            'gain' => $this->subjects($this->changed($after, $before), $node),
            'lose' => $this->subjects($this->changed($before, $after), $node),
        ];
    }

    /**
     * Субъекты, у которых в $a есть узел поддерева, которого нет в $b.
     *
     * @param  array<string, list<string>>  $a  субъект → узлы поддерева с доступом
     * @param  array<string, list<string>>  $b
     * @return list<string>
     */
    private function changed(array $a, array $b): array
    {
        $result = [];
        foreach ($a as $subject => $nodes) {
            if (array_diff($nodes, $b[$subject] ?? []) !== []) {
                $result[] = $subject;
            }
        }

        return $result;
    }

    /**
     * Ключи «user:<id>» / «group:<id>» → действующие люди и группы, группы — сначала, по названию.
     *
     * @param  list<string>  $keys
     * @return list<User|Group>
     */
    private function subjects(array $keys, NavNode $node): array
    {
        $ids = ['user' => [], 'group' => []];
        foreach ($keys as $key) {
            [$type, $id] = explode(':', $key, 2);
            $ids[$type][] = $id;
        }

        $groups = Group::query()->whereKey($ids['group'])->whereNull('archived_at')->orderByRaw('lower(name)')->get();
        $users = User::query()->whereKey($ids['user'])->orderBy('name')->get()
            ->filter(fn (User $user) => ! $user->isDeactivated() && $this->resolver->isActiveParticipant($node->company_id, $user));

        return [...$groups->all(), ...$users->values()->all()];
    }
}
