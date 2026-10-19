<?php

namespace App\Actions\Spaces;

use App\Actions\Navigation\NavTreeGuard;
use App\Enums\EventType;
use App\Enums\NavNodeType;
use App\Enums\SpaceRole;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use App\Services\Positions\Positioner;
use Illuminate\Support\Facades\DB;

/**
 * Создание пространства системным администратором вместе с администраторами пространства.
 * Пространство встаёт в конец корня дерева навигации или указанной активной папки (ADR-0013); иконка-эмодзи
 * необязательна.
 */
class CreateSpaceAction
{
    public const VIA = 'space_created';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly AddSpaceMemberAction $addMember,
        private readonly Positioner $positions,
        private readonly NavTreeGuard $guard,
    ) {}

    /**
     * @param  array{name: string, key: string, description?: string|null}  $data
     * @param  list<User>  $admins  администраторы пространства (не пусто)
     * @param  string|null  $parentId  папка в дереве навигации (null — корень)
     */
    public function handle(User $actor, array $data, array $admins, ?string $icon = null, ?string $parentId = null): Space
    {
        return DB::transaction(function () use ($actor, $data, $admins, $icon, $parentId) {
            NavNode::lockTree();
            $this->guard->ensureParent($parentId);

            $space = Space::query()->create($data);
            NavNode::query()->forceCreate([
                'type' => NavNodeType::Space,
                'parent_id' => $parentId,
                'space_id' => $space->id,
                'icon' => $icon,
                'position' => $this->positions->atEnd(NavNode::siblingsOf($parentId)),
            ]);

            $this->events->record(EventType::SpaceCreated, $actor, $space, [
                'admin_ids' => array_map(fn (User $admin) => $admin->id, $admins),
            ]);

            foreach ($admins as $admin) {
                $this->addMember->handle($actor, $space, $admin, SpaceRole::Admin, self::VIA);
            }

            return $space;
        });
    }
}
