<?php

namespace App\Actions\Navigation;

use App\Enums\EventType;
use App\Models\NavNode;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Название папки и иконка папки или пространства. Название пространства меняется в его настройках
 * (spaces.name). В журнал — только факт: название и иконка не пишутся.
 */
class UpdateNavNodeAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly NavTreeGuard $guard,
    ) {}

    /**
     * @param  array{name?: string, icon?: string|null}  $data
     */
    public function handle(User $actor, NavNode $node, array $data): NavNode
    {
        return DB::transaction(function () use ($actor, $node, $data) {
            NavNode::lockTree();
            $node = NavNode::query()->findOrFail($node->id);
            $this->guard->ensureEditable($node);

            if (! $node->isFolder() && array_key_exists('name', $data)) {
                throw ValidationException::withMessages(['name' => __('selen.navigation.space_name')]);
            }

            $node->fill($data);
            $renamed = $node->isDirty('name');
            $iconChanged = $node->isDirty('icon');
            $node->save();

            if ($renamed) {
                $this->events->record(EventType::FolderRenamed, $actor, $node);
            }

            if ($iconChanged) {
                $this->events->record(EventType::NavNodeIconChanged, $actor, $node, array_filter([
                    'node_id' => $node->id,
                    'space_id' => $node->space_id,
                ]));
            }

            return $node;
        });
    }
}
