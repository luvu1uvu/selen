<?php

namespace App\Actions\Navigation;

use App\Models\Company;
use App\Models\NavNode;
use Illuminate\Validation\ValidationException;

/** Общие проверки изменений дерева навигации (ADR-0013). */
class NavTreeGuard
{
    /** Родитель — корень (null) или активная папка дерева этой компании; иначе 422 (чужая папка — как несуществующая). */
    public function ensureParent(Company $company, ?string $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = NavNode::query()->inCompany($company)->folders()->whereNull('archived_at')->find($parentId);

        if ($parent === null) {
            throw ValidationException::withMessages(['parent_id' => __('selen.navigation.parent_not_folder')]);
        }
    }

    /**
     * Можно ли переместить узел под $parentId (и перестановка внутри той же папки): узел не в архиве, родитель — активная
     * папка этой компании или корень, папка — не в саму себя и не во вложенную (иначе цикл), глубина — не больше предела.
     * Вызывать под блокировкой дерева (NavNode::lockTree): иначе параллельное перемещение могло бы создать цикл.
     */
    public function ensureMovable(NavNode $node, ?string $parentId): void
    {
        $this->ensureEditable($node);

        if ($node->space?->isArchived()) {
            throw ValidationException::withMessages(['node' => __('selen.navigation.space_archived')]);
        }

        // Только в дереве своей компании (составной FK — страховка)
        $this->ensureParent($node->company, $parentId);

        if ($node->isFolder()) {
            $subtree = $node->folderSubtree();

            if ($parentId !== null && in_array($parentId, $subtree['ids'], true)) {
                throw ValidationException::withMessages(['parent_id' => __('selen.navigation.cycle')]);
            }

            if (NavNode::depthOf($parentId) + $subtree['height'] > NavNode::MAX_FOLDER_DEPTH) {
                throw ValidationException::withMessages([
                    'parent_id' => __('selen.navigation.too_deep', ['max' => NavNode::MAX_FOLDER_DEPTH]),
                ]);
            }
        }
    }

    /** Архивная папка — только для чтения. */
    public function ensureEditable(NavNode $node): void
    {
        if ($node->isArchived()) {
            throw ValidationException::withMessages(['node' => __('selen.navigation.folder_archived')]);
        }
    }
}
