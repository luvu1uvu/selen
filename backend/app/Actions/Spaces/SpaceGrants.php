<?php

namespace App\Actions\Spaces;

use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use LogicException;

/**
 * Строки выдач пространства для Actions участников и групп (docs/adr/0024-rights-2.md, П2a): найти выдачу субъекта,
 * создать её, сменить роль. В П2a у субъекта на узле пространства одна выдача (уникальный индекс в БД); роль API
 * (role + own_cards_only) переводится в стандартную роль (StandardRole::fromLegacy). Права по выдачам вычисляет
 * только AccessResolver.
 */
class SpaceGrants
{
    public function personal(Space $space, User $user): ?AccessGrant
    {
        return AccessGrant::query()->onSpace($space)->where('user_id', $user->getKey())->with('role')->first();
    }

    public function ofGroup(Space $space, Group $group): ?AccessGrant
    {
        return AccessGrant::query()->onSpace($space)->where('group_id', $group->getKey())->with('role')->first();
    }

    public function create(User $actor, Space $space, User|Group $subject, StandardRole $role): AccessGrant
    {
        $grant = AccessGrant::query()->create([
            'nav_node_id' => NavNode::query()->where('space_id', $space->getKey())->valueOrFail('id'),
            'user_id' => $subject instanceof User ? $subject->getKey() : null,
            'group_id' => $subject instanceof Group ? $subject->getKey() : null,
            'role_id' => Role::standard($role)->id,
            'granted_by' => $actor->getKey(),
        ]);

        return $grant->load('role');
    }

    /**
     * Стандартная роль выдачи — Actions работают с ролью API (role + own_cards_only). Пользовательских ролей до П2e
     * нет: выдачу с такой ролью прежнее API выразить не может.
     */
    public function standardRoleOf(AccessGrant $grant): StandardRole
    {
        return $grant->standardRole() ?? throw new LogicException('Grants with custom roles are managed by the roles API (П2e)');
    }

    public function changeRole(AccessGrant $grant, StandardRole $role): AccessGrant
    {
        $grant->forceFill(['role_id' => Role::standard($role)->id])->save();

        return $grant->load('role');
    }
}
