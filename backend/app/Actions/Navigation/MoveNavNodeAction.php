<?php

namespace App\Actions\Navigation;

use App\Actions\Access\AccessManagerGuard;
use App\Enums\EventType;
use App\Models\NavNode;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/**
 * Перемещение папки или пространства: в другую папку, в корень, на другое место среди соседей
 * (after_id/before_id, ADR-0007). Меняет только nav_nodes.parent_id/position — ключ пространства, номера
 * карточек, история и метрики не трогаются (ADR-0013). Унаследованный доступ меняется (выдачи на папки действуют на
 * всё внутри, П2d-1): что изменится, окно показывает заранее (MoveImpact); если пространство останется без того, кто
 * лично управляет доступом, — отказ 422.
 */
class MoveNavNodeAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
        private readonly NavTreeGuard $guard,
        private readonly AccessManagerGuard $access,
    ) {}

    public function handle(User $actor, NavNode $node, ?string $parentId, ?string $afterId, ?string $beforeId): NavNode
    {
        return DB::transaction(function () use ($actor, $node, $parentId, $afterId, $beforeId) {
            NavNode::lockTree();
            $node = NavNode::query()->with(['space', 'company'])->findOrFail($node->id);
            $this->guard->ensureMovable($node, $parentId);

            $fromParentId = $node->parent_id;
            $move = fn () => $node->forceFill([
                'parent_id' => $parentId,
                'position' => $this->positions->place(NavNode::siblingsOf($node->company_id, $parentId, $node->id), $afterId, $beforeId),
            ])->save();
            // Другая папка — другой унаследованный доступ (П2d-1): пространство не должно остаться без управляющего
            $fromParentId === $parentId ? $move() : $this->access->guard($node, $move, 'parent_id', moving: true);

            $payload = ['node_id' => $node->id, 'from_parent_id' => $fromParentId, 'to_parent_id' => $parentId];
            if ($node->space_id !== null) {
                $payload['space_id'] = $node->space_id;
            }
            $this->events->record(EventType::NavNodeMoved, $actor, $node, $payload);

            return $node;
        });
    }
}
