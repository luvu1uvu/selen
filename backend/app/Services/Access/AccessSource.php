<?php

namespace App\Services\Access;

use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;

/**
 * Один источник доступа пользователя к пространству — одна выдача (access_grants): личная (groupId = null)
 * или через группу, с ролью — набором прав и областью карточек. Права и область одного источника действуют
 * только вместе (ADR-0012, ADR-0024). Строит только AccessResolver.
 */
final readonly class AccessSource
{
    /**
     * @param  array<string, true>  $permissions  значения Permission, которые даёт роль
     */
    public function __construct(
        public string $roleId,
        public ?StandardRole $standardRole,
        public CardScope $cardScope,
        public array $permissions,
        public ?string $groupId = null,
    ) {}

    public function permits(Permission $permission): bool
    {
        return isset($this->permissions[$permission->value]);
    }

    /** Источник действует на все карточки пространства, а не только на «свои». */
    public function seesAllCards(): bool
    {
        return $this->cardScope === CardScope::All;
    }

    public function isPersonal(): bool
    {
        return $this->groupId === null;
    }

    /** Роль в API пространств (admin | editor | commenter); у пользовательских ролей (П2e) её нет. */
    public function legacyRole(): ?SpaceRole
    {
        return $this->standardRole?->legacyRole();
    }

    /** «Только свои карточки» в API пространств. */
    public function ownCardsOnly(): bool
    {
        return $this->cardScope === CardScope::Own;
    }
}
