<?php

namespace App\Models;

use App\Enums\NavNodeType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Узел дерева навигации: папка или пространство (позже — документ), docs/adr/0013-navigation-tree.md.
 * Папки не дают и не ограничивают доступ. Дерево ведёт только системный администратор через Actions
 * (app/Actions/Navigation); положение пространства в дереве не трогает его ключ, карточки и доступы.
 *
 * @property string $id
 * @property string|null $parent_id
 * @property NavNodeType $type
 * @property string|null $name
 * @property string|null $icon
 * @property string|null $space_id
 * @property string $position
 * @property Carbon|null $archived_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read NavNode|null $parent
 * @property-read Space|null $space
 */
#[Fillable(['name', 'icon'])]
class NavNode extends Model
{
    use HasUlids;

    /** Предельная глубина вложенности папок (пространство может лежать в папке 4-го уровня). */
    public const MAX_FOLDER_DEPTH = 4;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => NavNodeType::class,
            'archived_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<NavNode, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** @return BelongsTo<Space, $this> */
    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    /** @param  Builder<NavNode>  $query */
    public function scopeFolders(Builder $query): void
    {
        $query->where('type', NavNodeType::Folder);
    }

    public function isFolder(): bool
    {
        return $this->type === NavNodeType::Folder;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /**
     * Узлы с тем же родителем (для позиций), без этого узла.
     *
     * @return Builder<NavNode>
     */
    public static function siblingsOf(?string $parentId, ?string $exceptId = null): Builder
    {
        return self::query()
            ->when($parentId === null, fn ($q) => $q->whereNull('parent_id'), fn ($q) => $q->where('parent_id', $parentId))
            ->when($exceptId !== null, fn ($q) => $q->whereKeyNot($exceptId));
    }

    /** Глубина папки: папка в корне — 1. Для корня (null) — 0. */
    public static function depthOf(?string $folderId): int
    {
        if ($folderId === null) {
            return 0;
        }

        return (int) DB::selectOne(<<<'SQL'
            WITH RECURSIVE up AS (
                SELECT id, parent_id, 1 AS depth FROM nav_nodes WHERE id = ?
                UNION ALL
                SELECT n.id, n.parent_id, up.depth + 1 FROM nav_nodes n JOIN up ON n.id = up.parent_id
            )
            SELECT max(depth) AS depth FROM up
            SQL, [$folderId])->depth;
    }

    /**
     * Папки поддерева этой папки (включая её саму, включая архивные) и высота поддерева:
     * сама папка без вложенных — 1.
     *
     * @return array{ids: list<string>, height: int}
     */
    public function folderSubtree(): array
    {
        $rows = DB::select(<<<'SQL'
            WITH RECURSIVE down AS (
                SELECT id, 1 AS depth FROM nav_nodes WHERE id = ?
                UNION ALL
                SELECT n.id, down.depth + 1 FROM nav_nodes n JOIN down ON n.parent_id = down.id WHERE n.type = 'folder'
            )
            SELECT id, depth FROM down
            SQL, [$this->id]);

        return [
            'ids' => array_map(fn (object $row) => (string) $row->id, $rows),
            'height' => (int) max(array_map(fn (object $row) => $row->depth, $rows)),
        ];
    }

    /**
     * Сериализовать изменения структуры дерева до конца транзакции: без этого два параллельных
     * перемещения могли бы создать цикл или превысить глубину.
     */
    public static function lockTree(): void
    {
        DB::select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['nav_tree']);
    }
}
