<?php

namespace App\Actions\Navigation;

use App\Models\NavNode;
use Illuminate\Validation\ValidationException;

/** Общие проверки изменений дерева навигации (ADR-0013). */
class NavTreeGuard
{
    /** Родитель — корень (null) или активная папка; иначе 422. */
    public function ensureParent(?string $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        $parent = NavNode::query()->folders()->whereNull('archived_at')->find($parentId);

        if ($parent === null) {
            throw ValidationException::withMessages(['parent_id' => __('selen.navigation.parent_not_folder')]);
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
