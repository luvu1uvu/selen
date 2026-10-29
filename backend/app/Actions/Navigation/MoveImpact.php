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
 * кто получит и кто потеряет доступ к перемещаемому (к узлу или чему-то внутри), у кого изменятся роли при сохранённом
 * доступе (в том числе «только свои карточки») и какие пространства останутся без того, кто управляет доступом (тогда
 * перемещение — отказ 422). Сравнение — по каждому субъекту выдач (человек, группа) и каждому узлу поддерева: набор
 * ролей до и после (решение PM 29.10).
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
     * @return array{gain: list<User|Group>, lose: list<User|Group>, changed: list<User|Group>, changes_access: bool, dormant: bool, unmanaged: Collection<int, Space>}
     */
    public function of(NavNode $node, ?string $parentId): array
    {
        if ($parentId === $node->parent_id) {
            return ['gain' => [], 'lose' => [], 'changed' => [], 'changes_access' => false, 'dormant' => false, 'unmanaged' => new Collection];
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
     * Выполнить перемещение и вернуть, что изменилось в доступе к перемещаемому: кто получил и кто потерял доступ, у кого
     * при сохранённом доступе другой набор ролей (действующие люди и группы — для показа); changes_access — изменилось
     * ли хоть что-то, и у выдач, которые сейчас не действуют (группа в архиве, человек убран из компании или
     * деактивирован: они оживут при возвращении), dormant — есть ли такие среди изменений. Вызывать в транзакции под
     * блокировкой дерева.
     *
     * @param  Closure(): mixed  $move
     * @return array{gain: list<User|Group>, lose: list<User|Group>, changed: list<User|Group>, changes_access: bool, dormant: bool}
     */
    public function apply(NavNode $node, Closure $move): array
    {
        $before = $this->resolver->subtreeSubjects($node);
        $move();
        $after = $this->resolver->subtreeSubjects($node);

        $gain = $this->gained($after, $before);
        $lose = $this->gained($before, $after);
        // Получивший или потерявший доступ уже в списке — второй раз не показываем
        $changed = array_values(array_diff($this->rolesChanged($before, $after), $gain, $lose));
        $shown = [
            'gain' => $this->subjects($gain, $node),
            'lose' => $this->subjects($lose, $node),
            'changed' => $this->subjects($changed, $node),
        ];
        $raw = count($gain) + count($lose) + count($changed);

        return $shown + [
            'changes_access' => $raw > 0,
            'dormant' => $raw > count($shown['gain']) + count($shown['lose']) + count($shown['changed']),
        ];
    }

    /**
     * Субъекты, у которых в $a есть узел поддерева, которого нет в $b.
     *
     * @param  array<string, array<string, list<string>>>  $a  субъект → узел поддерева → роли
     * @param  array<string, array<string, list<string>>>  $b
     * @return list<string>
     */
    private function gained(array $a, array $b): array
    {
        $result = [];
        foreach ($a as $subject => $nodes) {
            if (array_diff_key($nodes, $b[$subject] ?? []) !== []) {
                $result[] = $subject;
            }
        }

        return $result;
    }

    /**
     * Субъекты, у которых на узле с доступом и до, и после — другой набор ролей.
     *
     * @param  array<string, array<string, list<string>>>  $before
     * @param  array<string, array<string, list<string>>>  $after
     * @return list<string>
     */
    private function rolesChanged(array $before, array $after): array
    {
        $result = [];
        foreach ($before as $subject => $nodes) {
            foreach ($nodes as $nodeId => $roles) {
                if (isset($after[$subject][$nodeId]) && $after[$subject][$nodeId] !== $roles) {
                    $result[] = $subject;
                    break;
                }
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
