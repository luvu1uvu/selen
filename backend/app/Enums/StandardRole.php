<?php

namespace App\Enums;

use LogicException;

/**
 * Стандартные роли (docs/adr/0024-rights-2.md): общие, не редактируются; строки в roles с этим key
 * и их права в role_permissions создают и меняют только миграции. permissions() — эталон для них
 * (StandardRolesTest сверяет с базой).
 *
 * API пространств пока прежний (П2a): роль admin | editor | commenter и флаг own_cards_only.
 * fromLegacy() / legacyRole() / ownCardsOnly() переводят эту пару в стандартную роль и обратно.
 */
enum StandardRole: string
{
    case Admin = 'admin';
    case Editor = 'editor';
    case Commenter = 'commenter';
    case EditorOwnCards = 'editor_own';
    case CommenterOwnCards = 'commenter_own';

    /** Роль API (admin | editor | commenter) + «только свои карточки» → стандартная роль. */
    public static function fromLegacy(SpaceRole $role, bool $ownCardsOnly = false): self
    {
        return match ($role) {
            SpaceRole::Admin => $ownCardsOnly
                // Как прежний CHECK «admin без ограничения» (ADR-0008): Actions проверяют это раньше (422)
                ? throw new LogicException('The admin role cannot be limited to own cards')
                : self::Admin,
            SpaceRole::Editor => $ownCardsOnly ? self::EditorOwnCards : self::Editor,
            SpaceRole::Commenter => $ownCardsOnly ? self::CommenterOwnCards : self::Commenter,
        };
    }

    /** Роль в API пространств (my_role, участники, группы, журнал). */
    public function legacyRole(): SpaceRole
    {
        return match ($this) {
            self::Admin => SpaceRole::Admin,
            self::Editor, self::EditorOwnCards => SpaceRole::Editor,
            self::Commenter, self::CommenterOwnCards => SpaceRole::Commenter,
        };
    }

    public function ownCardsOnly(): bool
    {
        return $this->cardScope() === CardScope::Own;
    }

    public function cardScope(): CardScope
    {
        return match ($this) {
            self::EditorOwnCards, self::CommenterOwnCards => CardScope::Own,
            default => CardScope::All,
        };
    }

    /**
     * Права роли. «Администратор» получит права на папки, перемещение, архив и удаление пространства
     * и корзину только в П2d (решение PM 23.10): до этого их проверяет системный администратор.
     *
     * @return list<Permission>
     */
    public function permissions(): array
    {
        $commenter = [
            ...Permission::alwaysGranted(),
            Permission::CardComment,
            Permission::FieldRead,
        ];
        $editor = [
            ...$commenter,
            Permission::CardCreate,
            Permission::CardUpdate,
            Permission::CardMove,
            Permission::CardInvite,
            Permission::FieldUpdate,
        ];

        return match ($this) {
            self::Admin => [
                ...$editor,
                Permission::SpaceUpdate,
                Permission::SpaceManageAccess,
                Permission::SpaceViewSettings,
                Permission::BoardCreate,
                Permission::BoardUpdate,
                Permission::BoardDelete,
                Permission::FieldDelete,
                Permission::TimeViewOthers,
                Permission::TimeEditOthers,
                Permission::AutomationView,
                Permission::AutomationManage,
            ],
            self::Editor, self::EditorOwnCards => $editor,
            self::Commenter, self::CommenterOwnCards => $commenter,
        };
    }
}
