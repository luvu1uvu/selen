<?php

namespace App\Actions\Navigation;

use App\Enums\EventType;
use App\Enums\NavNodeType;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Новая папка в конце выбранной папки или корня (ADR-0013). Название в журнал не пишется. */
class CreateFolderAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly Positioner $positions,
        private readonly NavTreeGuard $guard,
    ) {}

    public function handle(User $actor, Company $company, string $name, ?string $icon, ?string $parentId): NavNode
    {
        return DB::transaction(function () use ($actor, $company, $name, $icon, $parentId) {
            NavNode::lockTree();
            $this->guard->ensureParent($company, $parentId);

            if (NavNode::depthOf($parentId) + 1 > NavNode::MAX_FOLDER_DEPTH) {
                throw ValidationException::withMessages([
                    'parent_id' => __('selen.navigation.too_deep', ['max' => NavNode::MAX_FOLDER_DEPTH]),
                ]);
            }

            $folder = NavNode::query()->forceCreate([
                'company_id' => $company->id,
                'parent_id' => $parentId,
                'type' => NavNodeType::Folder,
                'name' => $name,
                'icon' => $icon,
                'position' => $this->positions->atEnd(NavNode::siblingsOf($company, $parentId)),
            ]);

            $this->events->record(EventType::FolderCreated, $actor, $folder, ['parent_id' => $parentId]);

            return $folder;
        });
    }
}
