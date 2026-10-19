<?php

namespace App\Services\Access;

use App\Enums\SpaceRole;

/**
 * Один источник доступа пользователя к пространству: личное участие (groupId = null) или группа.
 * Роль и режим «только свои карточки» источника действуют только вместе (docs/adr/0012-groups.md).
 */
final readonly class AccessSource
{
    public function __construct(
        public SpaceRole $role,
        public bool $ownCardsOnly,
        public ?string $groupId = null,
    ) {}

    public function isPersonal(): bool
    {
        return $this->groupId === null;
    }
}
