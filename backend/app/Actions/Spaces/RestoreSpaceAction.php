<?php

namespace App\Actions\Spaces;

use App\Enums\EventType;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Восстановление пространства из архива. Если его папка в архиве — пространство возвращается в корень
 * дерева навигации (решение PM 2 этапа 3, ADR-0013): в архивной папке не бывает активного содержимого.
 */
class RestoreSpaceAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
    ) {}

    public function handle(User $actor, Space $space): Space
    {
        return DB::transaction(function () use ($actor, $space) {
            $space = Space::query()->lockForUpdate()->findOrFail($space->id);

            if (! $space->isArchived()) {
                throw ValidationException::withMessages(['space' => __('selen.spaces.not_archived')]);
            }

            $space->forceFill(['archived_at' => null])->save();
            $this->events->record(EventType::SpaceRestored, $actor, $space);
            $this->leaveArchivedFolder($actor, $space);

            return $space;
        });
    }

    private function leaveArchivedFolder(User $actor, Space $space): void
    {
        NavNode::lockTree();
        $node = NavNode::query()->where('space_id', $space->id)->with('parent')->first();

        if ($node?->parent === null || ! $node->parent->isArchived()) {
            return;
        }

        $fromParentId = $node->parent_id;
        $node->forceFill(['parent_id' => null, 'position' => $this->positions->atEnd(NavNode::siblingsOf($node->company_id, null))])->save();
        $this->events->record(EventType::NavNodeMoved, $actor, $node, [
            'node_id' => $node->id,
            'space_id' => $space->id,
            'from_parent_id' => $fromParentId,
            'to_parent_id' => null,
            'via' => 'space_restored',
        ]);
    }
}
