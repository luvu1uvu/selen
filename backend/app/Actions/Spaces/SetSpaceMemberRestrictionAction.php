<?php

namespace App\Actions\Spaces;

use App\Actions\Access\NodeGrants;
use App\Actions\Access\SetNodeAccessAction;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Validation\ValidationException;

/**
 * Режим «только свои карточки» для личных ролей участника на пространстве (ADR-0008) — для демо-данных: в модели прав
 * (ADR-0024) это стандартные роли «— только свои карточки», в интерфейсе их выбирают ролями (П2d-1). Каждая роль
 * Редактора и Комментатора меняется на вариант «только свои» и обратно.
 */
class SetSpaceMemberRestrictionAction
{
    public function __construct(
        private readonly SetNodeAccessAction $setAccess,
        private readonly NodeGrants $grants,
    ) {}

    public function handle(User $actor, Space $space, User $user, bool $ownCardsOnly): void
    {
        $current = $this->grants->of($space->navNode, $user);
        if ($current->isEmpty()) {
            throw (new ModelNotFoundException)->setModel(AccessGrant::class);
        }

        $roles = $current->map(function (AccessGrant $grant) use ($ownCardsOnly) {
            $role = $grant->standardRole() ?? throw new \LogicException('A custom role has no «own cards» variant');
            if ($role === StandardRole::Admin) {
                return $ownCardsOnly
                    ? throw ValidationException::withMessages(['roles' => __('selen.spaces.admin_not_restricted')])
                    : $role;
            }

            return StandardRole::fromLegacy($role->legacyRole(), $ownCardsOnly);
        })->unique()->map(fn (StandardRole $role) => Role::standard($role))->values()->all();

        $this->setAccess->handle($actor, $space->navNode, $user, $roles);
    }
}
