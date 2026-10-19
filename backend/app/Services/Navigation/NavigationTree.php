<?php

namespace App\Services\Navigation;

use App\Enums\NavNodeType;
use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\SpaceAccess;
use App\Services\Access\SpaceAccessResolver;
use Illuminate\Support\Collection;

/**
 * Дерево навигации (docs/adr/0013-navigation-tree.md).
 *
 * Для пользователя: папки не дают доступа — видна только папка, в которой на любой глубине есть доступное ему
 * активное пространство; каждое доступное активное пространство видно всегда (даже без досок), под ним —
 * активные доски. Названия прочих папок в ответ не попадают — правило одно для всех, включая системного
 * администратора: полная структура со всеми названиями — только в «Структуре» (forAdmin). Единственное
 * дополнение — Владельцу (ADR-0017) видны ещё и по-настоящему пустые папки (на любой глубине нет ни одного
 * пространства — ни активного, ни архивного), с пометкой `empty`; пустая папка внутри скрытой не видна и ему.
 * Число запросов не зависит от размера дерева: права — одним запросом резолвера, узлы — одним, доски — одним.
 *
 * Значок «доступно всем» (группа «Все сотрудники», ADR-0012): у пространства — у него есть доступ этой группы;
 * у папки — в ней есть активное пространство и все её активные пространства на любой глубине открыты всем
 * (по всему дереву, а не только по видимой пользователю части).
 */
class NavigationTree
{
    public function __construct(private readonly SpaceAccessResolver $resolver) {}

    /**
     * Дерево пользователя: вложенные узлы.
     *
     * @return list<array<string, mixed>>
     */
    public function forUser(User $user): array
    {
        $accesses = Space::accessesOf($user);
        // Все узлы, включая архивные папки: пространство в архивной папке тоже делает папки над ней непустыми
        $nodes = NavNode::query()->with('space')->orderBy('position')->get();

        $visible = $nodes
            ->filter(fn (NavNode $node) => $node->space !== null && ! $node->space->isArchived()
                && ($accesses[$node->space_id] ?? null)?->isMember())
            ->pluck('space_id');

        $boards = Board::query()
            ->whereIn('space_id', $visible)
            ->active()
            ->orderBy('position')
            ->get(['id', 'space_id', 'name'])
            ->groupBy('space_id');

        $context = [
            'children' => $nodes->groupBy(fn (NavNode $node) => $node->parent_id ?? ''),
            'open' => $this->resolver->spacesOpenToEveryone()->flip(),
            'visible' => $visible->flip(),
            'boards' => $boards,
            'accesses' => $accesses,
            'withSpaces' => $this->foldersWithSpaces($nodes),
            'showEmpty' => $user->isOwner(),
        ];

        return $this->branch('', $context)['items'];
    }

    /**
     * Папки, в которых на любой глубине есть хоть одно пространство (активное или архивное): подъём от каждого
     * узла-пространства по родителям. Остальные папки — по-настоящему пустые.
     *
     * @param  Collection<int, NavNode>  $nodes
     * @return Collection<string, int>
     */
    private function foldersWithSpaces(Collection $nodes): Collection
    {
        $parents = $nodes->pluck('parent_id', 'id');
        $result = [];

        foreach ($nodes as $node) {
            if ($node->isFolder()) {
                continue;
            }
            for ($id = $node->parent_id; $id !== null && ! isset($result[$id]); $id = $parents[$id] ?? null) {
                $result[$id] = true;
            }
        }

        return collect($result)->keys()->flip();
    }

    /**
     * Полное дерево для админки «Структура»: плоский список узлов в порядке обхода (родитель, затем дети),
     * включая архивные папки и пространства.
     *
     * @return list<array<string, mixed>>
     */
    public function forAdmin(): array
    {
        $nodes = NavNode::query()->with('space')->orderBy('position')->get();
        $children = $nodes->groupBy(fn (NavNode $node) => $node->parent_id ?? '');
        $open = $this->resolver->spacesOpenToEveryone()->flip();
        $list = [];

        $walk = function (string $parentKey, int $depth) use (&$walk, &$list, $children, $open): array {
            $stats = ['active' => 0, 'open' => 0];

            foreach ($children->get($parentKey, collect()) as $node) {
                /** @var NavNode $node */
                $index = count($list);
                $list[] = null;

                if ($node->isFolder()) {
                    $inner = $walk($node->id, $depth + 1);
                    $everyone = $inner['active'] > 0 && $inner['open'] === $inner['active'];
                    $stats['active'] += $inner['active'];
                    $stats['open'] += $inner['open'];
                } else {
                    $active = $node->space !== null && ! $node->space->isArchived();
                    $everyone = $open->has((string) $node->space_id);
                    $stats['active'] += $active ? 1 : 0;
                    $stats['open'] += $active && $everyone ? 1 : 0;
                }

                $list[$index] = [
                    'id' => $node->id,
                    'parent_id' => $node->parent_id,
                    'type' => $node->type,
                    'name' => $node->name,
                    'icon' => $node->icon,
                    'depth' => $depth,
                    'archived_at' => $node->archived_at?->toIso8601ZuluString(),
                    'everyone' => $everyone,
                    'space' => $node->space === null ? null : [
                        'id' => $node->space->id,
                        'key' => $node->space->key,
                        'name' => $node->space->name,
                        'archived_at' => $node->space->archived_at?->toIso8601ZuluString(),
                    ],
                ];
            }

            return $stats;
        };

        $walk('', 1);

        return array_values(array_filter($list));
    }

    /**
     * Узлы одного родителя для пользователя и счётчики активных и открытых всем пространств в поддереве.
     *
     * @param  array{children: Collection<array-key, mixed>, open: Collection<array-key, mixed>, visible: Collection<array-key, mixed>, boards: Collection<array-key, mixed>, accesses: Collection<array-key, SpaceAccess>, withSpaces: Collection<string, int>, showEmpty: bool}  $context
     * @return array{items: list<array<string, mixed>>, active: int, open: int, visible: int}
     */
    private function branch(string $parentKey, array $context): array
    {
        $result = ['items' => [], 'active' => 0, 'open' => 0, 'visible' => 0];

        foreach ($context['children']->get($parentKey, collect()) as $node) {
            /** @var NavNode $node */
            if ($node->isFolder()) {
                // Архивные папки в дереве не показываются (в них только архивное — ADR-0013)
                if ($node->isArchived()) {
                    continue;
                }

                $inner = $this->branch($node->id, $context);
                $result['active'] += $inner['active'];
                $result['open'] += $inner['open'];
                $result['visible'] += $inner['visible'];
                $empty = ! $context['withSpaces']->has($node->id);

                if ($inner['visible'] > 0 || ($empty && $context['showEmpty'])) {
                    $result['items'][] = [
                        'type' => NavNodeType::Folder,
                        'id' => $node->id,
                        'name' => $node->name,
                        'icon' => $node->icon,
                        'everyone' => $inner['active'] > 0 && $inner['open'] === $inner['active'],
                        // Только у Владельца бывает true: остальным пустые папки не приходят
                        'empty' => $empty,
                        'children' => $inner['items'],
                    ];
                }

                continue;
            }

            $space = $node->space;
            if ($space === null || $space->isArchived()) {
                continue;
            }

            $everyone = $context['open']->has($space->id);
            $result['active']++;
            $result['open'] += $everyone ? 1 : 0;

            if ($context['visible']->has($space->id)) {
                $result['visible']++;
                $result['items'][] = [
                    'type' => NavNodeType::Space,
                    'id' => $node->id,
                    'icon' => $node->icon,
                    'everyone' => $everyone,
                    // Управлять пространством (создать доску) — как BoardPolicy::create
                    'can_manage' => $context['accesses'][$space->id]->allows(fn (SpaceRole $role) => $role->canManageSpace()),
                    'space' => ['id' => $space->id, 'key' => $space->key, 'name' => $space->name],
                    'boards' => $context['boards']->get($space->id, collect())
                        ->map(fn (Board $board) => ['id' => $board->id, 'name' => $board->name])
                        ->values()
                        ->all(),
                ];
            }
        }

        return $result;
    }
}
