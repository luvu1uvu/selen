<?php

namespace App\Enums;

/**
 * Каталог прав (docs/adr/0024-rights-2.md, журнал «Права 2.0», раздел 3).
 *
 * Права сущности (scope = entity) входят в роли: роль — набор этих прав и область карточек (CardScope).
 * Права компании (scope = company) в роли не входят: с П2b-1 их даёт членство (Владелец — все, администратор компании —
 * companyAdminDefaults()), с П2c — ещё и выдача лично или группе компании (grantable(); ownerGranted() — только Владелец).
 * Политики проверяют права отсюда, а не названия ролей (CLAUDE.md, правило 11).
 *
 * Правила:
 * - формат «<группа>.<действие>»; значения не переименовываем — они лежат в role_permissions;
 * - новое право — case здесь, его место в StandardRole::permissions() и миграция прав стандартных ролей
 *   (и ролей с флагом «выдавать новые права», П2e);
 * - since() — с какого подэтапа или этапа право проверяется; до этого действие проверяется по-старому
 *   (например, папки и корзина — правом компании до П2d) или его ещё нет.
 */
enum Permission: string
{
    // Папки
    case FolderRead = 'folder.read';
    case FolderCreate = 'folder.create';
    case FolderUpdate = 'folder.update';
    case FolderMove = 'folder.move';
    case FolderMoveOut = 'folder.move_out';
    case FolderDelete = 'folder.delete';
    case FolderManageAccess = 'folder.manage_access';

    // Пространства
    case SpaceCreate = 'space.create';
    case SpaceRead = 'space.read';
    case SpaceUpdate = 'space.update';
    case SpaceMove = 'space.move';
    case SpaceDelete = 'space.delete';
    case SpaceManageAccess = 'space.manage_access';
    case SpaceViewSettings = 'space.view_settings';

    // Доски
    case BoardRead = 'board.read';
    case BoardCreate = 'board.create';
    case BoardUpdate = 'board.update';
    case BoardDelete = 'board.delete';

    // Карточки (какие карточки видны — область роли, CardScope)
    case CardCreate = 'card.create';
    case CardUpdate = 'card.update';
    case CardMove = 'card.move';
    case CardInvite = 'card.invite';
    case CardDelete = 'card.delete';
    case CardComment = 'card.comment';

    // Поля (этап 5): права на каждое поле; здесь — значения по умолчанию для роли
    case FieldRead = 'field.read';
    case FieldUpdate = 'field.update';
    case FieldDelete = 'field.delete';

    // Время (этап 6)
    case TimeViewOthers = 'time.view_others';
    case TimeEditOthers = 'time.edit_others';

    // Автоматизации (этап 10)
    case AutomationView = 'automation.view';
    case AutomationManage = 'automation.manage';

    // Права компании
    case CompanyInviteUsers = 'company.invite_users';
    case CompanyManageUsers = 'company.manage_users';
    case CompanyDeleteUsers = 'company.delete_users';
    case CompanyManageGroups = 'company.manage_groups';
    case CompanyManageDictionaries = 'company.manage_dictionaries';
    case CompanyManageRoles = 'company.manage_roles';
    case CompanyManageStructure = 'company.manage_structure';
    case CompanyManageAccess = 'company.manage_access';
    case CompanyViewEventLog = 'company.view_event_log';
    case CompanyManageTrash = 'company.manage_trash';
    case CompanyViewTimeAnalytics = 'company.view_time_analytics';

    /** Группа каталога: folders, spaces, boards, cards, fields, time, automations, company. */
    public function group(): string
    {
        return match (strstr($this->value, '.', true)) {
            'folder' => 'folders',
            'space' => 'spaces',
            'board' => 'boards',
            'card' => 'cards',
            'field' => 'fields',
            'time' => 'time',
            'automation' => 'automations',
            default => 'company',
        };
    }

    /** entity — право входит в роли на папку или пространство; company — право компании. */
    public function scope(): string
    {
        return $this->group() === 'company' ? 'company' : 'entity';
    }

    /** С какого подэтапа «Прав 2.0» или этапа дорожной карты право проверяется. */
    public function since(): string
    {
        return match ($this) {
            self::SpaceRead, self::SpaceUpdate, self::SpaceManageAccess,
            self::BoardRead, self::BoardCreate, self::BoardUpdate, self::BoardDelete,
            self::CardCreate, self::CardUpdate, self::CardMove, self::CardInvite, self::CardComment => 'П2a',
            self::FolderRead, self::FolderCreate, self::FolderUpdate, self::FolderMove, self::FolderMoveOut,
            self::FolderDelete, self::FolderManageAccess,
            self::SpaceCreate, self::SpaceMove, self::SpaceDelete, self::CardDelete => 'П2d',
            self::SpaceViewSettings, self::FieldRead, self::FieldUpdate, self::FieldDelete => 'этап 5',
            self::TimeViewOthers, self::TimeEditOthers => 'этап 6',
            self::AutomationView, self::AutomationManage => 'этап 10',
            // Админка компании (П2b-1): у Владельца и администратора компании по умолчанию; выдача лично и группам — с П2c
            self::CompanyInviteUsers, self::CompanyManageUsers, self::CompanyManageGroups,
            self::CompanyManageDictionaries, self::CompanyManageStructure, self::CompanyManageAccess,
            self::CompanyViewEventLog, self::CompanyManageTrash => 'П2b-1',
            self::CompanyManageRoles => 'П2e',
            self::CompanyDeleteUsers => 'LATER-105',
            // Аналитика трудозатрат (этап 9): гейт AppServiceProvider::VIEW_WORK_TIME_ANALYTICS — по этому праву с П2c
            self::CompanyViewTimeAnalytics => 'П2c',
        };
    }

    /**
     * Права компании администратора компании по умолчанию: все, кроме «удалять пользователей» и «аналитика
     * трудозатрат» — их по умолчанию держит и выдаёт только Владелец (решение PM 23.10, В17).
     *
     * @return list<self>
     */
    public static function companyAdminDefaults(): array
    {
        return array_values(array_filter(
            self::companyScope(),
            fn (self $permission) => ! in_array($permission, self::ownerGranted(), true),
        ));
    }

    /**
     * Все права компании (scope = company) — у Владельца.
     *
     * @return list<self>
     */
    public static function companyScope(): array
    {
        return array_values(array_filter(self::cases(), fn (self $permission) => $permission->scope() === 'company'));
    }

    /**
     * Права компании, которые выдаёт только Владелец (решение PM 23.10, В17): у администратора компании их нет
     * по умолчанию, и выдать их он не может.
     *
     * @return list<self>
     */
    public static function ownerGranted(): array
    {
        return [self::CompanyDeleteUsers, self::CompanyViewTimeAnalytics];
    }

    /**
     * Права компании, которые можно выдать человеку или группе («Права компании», П2c): только уже действующие —
     * «управлять ролями» появится с пользовательскими ролями (П2e), «удалять пользователей» — с удалением (LATER-105).
     *
     * @return list<self>
     */
    public static function grantable(): array
    {
        return array_values(array_filter(
            self::companyScope(),
            fn (self $permission) => in_array($permission->since(), ['П2b-1', 'П2c'], true),
        ));
    }

    /**
     * Права сущности, которые входят в любую роль и не снимаются (чтение, решение PM 23.10, В14).
     *
     * @return list<self>
     */
    public static function alwaysGranted(): array
    {
        return [self::FolderRead, self::SpaceRead, self::BoardRead];
    }
}
