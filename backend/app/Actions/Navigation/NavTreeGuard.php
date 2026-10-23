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

    /** Архивная папка — только для чтения. */
    public function ensureEditable(NavNode $node): void
    {
        if ($node->isArchived()) {
            throw ValidationException::withMessages(['node' => __('selen.navigation.folder_archived')]);
        }
    }
}
