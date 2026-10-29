<?php

namespace App\Http\Resources;

use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Что изменит «Переместить в…» в доступе (П2d-1, MoveImpact): кто получит и кто потеряет доступ, у кого изменятся роли
 * (люди и группы — по имени, только админка); изменится ли что-то в доступе вообще (changes_access — тогда нужно ещё
 * право «управлять доступом») и есть ли среди изменений выдачи, которые сейчас не действуют (dormant); где не останется
 * того, кто лично управляет доступом.
 *
 * @property array{gain: list<User|Group>, lose: list<User|Group>, changed: list<User|Group>, changes_access: bool, dormant: bool, unmanaged: Collection<int, Space>} $resource
 */
class MoveImpactResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $subject = fn (User|Group $subject) => $subject instanceof Group
            ? ['type' => 'group', 'id' => $subject->id, 'name' => $subject->name, 'system' => $subject->system_key]
            : ['type' => 'user', 'id' => $subject->id, 'name' => $subject->name];

        return [
            'gain' => array_map($subject, $this->resource['gain']),
            'lose' => array_map($subject, $this->resource['lose']),
            'changed' => array_map($subject, $this->resource['changed']),
            'changes_access' => $this->resource['changes_access'],
            'dormant' => $this->resource['dormant'],
            'unmanaged_spaces' => $this->resource['unmanaged']
                ->map(fn (Space $space) => ['id' => $space->id, 'key' => $space->key, 'name' => $space->name])
                ->values(),
        ];
    }
}
