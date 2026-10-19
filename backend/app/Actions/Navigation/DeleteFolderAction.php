<?php

namespace App\Actions\Navigation;

use App\Enums\EventType;
use App\Models\NavNode;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Удаление папки навсегда (LATER-43, ADR-0013 «Изменения»): только пустой — без вложенных папок и пространств,
 * в том числе архивных. Непустую нужно сначала разобрать: перенести или удалить содержимое.
 */
class DeleteFolderAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, NavNode $folder): void
    {
        DB::transaction(function () use ($actor, $folder) {
            NavNode::lockTree();
            $folder = NavNode::query()->folders()->findOrFail($folder->id);

            if (NavNode::query()->where('parent_id', $folder->id)->exists()) {
                throw ValidationException::withMessages(['node' => __('selen.navigation.delete_not_empty')]);
            }

            $this->events->record(EventType::FolderDeleted, $actor, $folder, ['parent_id' => $folder->parent_id]);
            $folder->delete();
        });
    }
}
