<?php

namespace App\Actions\Navigation;

use App\Actions\Spaces\RestoreSpaceAction;
use App\Enums\EventType;
use App\Enums\NavNodeType;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архив и восстановление папки (решение PM 2 этапа 3, ADR-0013). Архивировать можно только папку без
 * активного содержимого: активные пространства и папки мешают (422 со списком). Архивные остаются внутри.
 * Восстановленная папка, чей родитель в архиве, возвращается в корень; по желанию вместе с ней восстанавливаются
 * архивные пространства, лежащие прямо в ней (приёмка этапа 3).
 */
class SetFolderArchivedAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
        private readonly RestoreSpaceAction $restoreSpace,
    ) {}

    /**
     * @param  bool  $restoreSpaces  при восстановлении — вернуть и архивные пространства, лежащие прямо в папке
     *                               (тем же действием, что в админке «Пространства», с записью в журнал)
     */
    public function handle(User $actor, NavNode $folder, bool $archived, bool $restoreSpaces = false): NavNode
    {
        return DB::transaction(function () use ($actor, $folder, $archived, $restoreSpaces) {
            NavNode::lockTree();
            $folder = NavNode::query()->folders()->findOrFail($folder->id);

            if ($folder->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'node' => __($archived ? 'selen.navigation.already_archived' : 'selen.navigation.not_archived'),
                ]);
            }

            if ($archived) {
                $this->ensureNoActiveContent($folder);
                $folder->forceFill(['archived_at' => Date::now()])->save();
                $this->events->record(EventType::FolderArchived, $actor, $folder);

                return $folder;
            }

            $attributes = ['archived_at' => null];
            if ($folder->parent_id !== null && NavNode::query()->whereKey($folder->parent_id)->whereNotNull('archived_at')->exists()) {
                $attributes += ['parent_id' => null, 'position' => $this->positions->atEnd(NavNode::siblingsOf(null))];
            }

            $folder->forceFill($attributes)->save();
            $this->events->record(EventType::FolderRestored, $actor, $folder, ['parent_id' => $folder->parent_id]);

            if ($restoreSpaces) {
                $this->restoreArchivedSpaces($actor, $folder);
            }

            return $folder;
        });
    }

    /**
     * Архивные пространства прямо в папке; во вложенных архивных папках — нет: восстановленное оттуда ушло бы
     * в корень, а не на место.
     */
    private function restoreArchivedSpaces(User $actor, NavNode $folder): void
    {
        $spaces = Space::query()
            ->whereNotNull('archived_at')
            ->whereHas('navNode', fn ($q) => $q->where('parent_id', $folder->id))
            ->get();

        foreach ($spaces as $space) {
            $this->restoreSpace->handle($actor, $space);
        }
    }

    /**
     * Прямые потомки достаточно: в архивной папке не бывает активного содержимого (его нельзя туда
     * переместить, а восстановленное из неё уходит в корень).
     */
    private function ensureNoActiveContent(NavNode $folder): void
    {
        $blocking = NavNode::query()
            ->with('space')
            ->where('parent_id', $folder->id)
            ->where(fn ($q) => $q
                ->where(fn ($q) => $q->where('type', NavNodeType::Folder)->whereNull('archived_at'))
                ->orWhere(fn ($q) => $q->where('type', NavNodeType::Space)->whereHas('space', fn ($q) => $q->whereNull('archived_at'))))
            ->orderBy('position')
            ->get()
            ->map(fn (NavNode $node) => $node->isFolder() ? $node->name : $node->space?->name);

        if ($blocking->isNotEmpty()) {
            throw ValidationException::withMessages([
                'node' => __('selen.navigation.folder_not_empty', ['items' => $blocking->implode(', ')]),
            ]);
        }
    }
}
