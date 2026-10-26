<?php

namespace App\Enums;

/**
 * Каталог типов событий журнала (таблица event_log).
 *
 * Правила (docs/adr/0003-event-log.md):
 * - формат «<область>.<что произошло>» в прошедшем времени;
 * - значения не переименовываем и не удаляем — они уже лежат в журнале;
 * - при добавлении типа обновите frontend/src/features/admin/eventTypes.ts и перевод.
 */
enum EventType: string
{
    // Аутентификация
    case LoginSucceeded = 'auth.login_succeeded';
    case LoginFailed = 'auth.login_failed';
    case Logout = 'auth.logout';
    case PasswordChanged = 'auth.password_changed';
    case PasswordResetRequested = 'auth.password_reset_requested';
    case PasswordResetCompleted = 'auth.password_reset_completed';

    // Компании (subject — компания; события системные, без компании — видит только Владелец, ADR-0024; название
    // в журнал не пишется)
    case CompanyCreated = 'company.created';
    case CompanyRenamed = 'company.renamed';

    // Пользователи
    case UserCreated = 'user.created';
    case UserInvited = 'user.invited';
    case UserProfileUpdated = 'user.profile_updated';
    case UserRoleChanged = 'user.role_changed';
    case UserDeactivated = 'user.deactivated';
    case UserReactivated = 'user.reactivated';
    // {from_user_id (null — Владельца не было), to_user_id, via: admin_panel | console | migration}, ADR-0017
    case UserOwnershipTransferred = 'user.ownership_transferred';

    // Приглашения
    case InvitationResent = 'invitation.resent';
    case InvitationRevoked = 'invitation.revoked';
    case InvitationAccepted = 'invitation.accepted';

    // Пространства и участники
    case SpaceCreated = 'space.created';
    case SpaceUpdated = 'space.updated';
    case SpaceArchived = 'space.archived';
    case SpaceRestored = 'space.restored';
    case SpaceDeleted = 'space.deleted';
    case SpaceMemberAdded = 'space.member_added';
    case SpaceMemberRoleChanged = 'space.member_role_changed';
    case SpaceMemberRemoved = 'space.member_removed';
    /** Режим «только свои карточки» включён или выключен (ADR-0008). */
    case SpaceMemberRestrictionChanged = 'space.member_restriction_changed';
    // Доступ групп к пространству (subject — пространство, в payload — group_id, ADR-0012)
    case SpaceGroupAdded = 'space.group_added';
    case SpaceGroupRoleChanged = 'space.group_role_changed';
    case SpaceGroupRestrictionChanged = 'space.group_restriction_changed';
    case SpaceGroupRemoved = 'space.group_removed';

    // Группы пользователей (subject — группа; название и описание в журнал не пишутся)
    case GroupCreated = 'group.created';
    case GroupUpdated = 'group.updated';
    case GroupArchived = 'group.archived';
    case GroupRestored = 'group.restored';
    case GroupMemberAdded = 'group.member_added';
    case GroupMemberRemoved = 'group.member_removed';

    // Дерево навигации (ADR-0013): subject — узел дерева; названия папок — тексты, в журнал не пишутся
    case FolderCreated = 'folder.created';
    case FolderRenamed = 'folder.renamed';
    case FolderArchived = 'folder.archived';
    case FolderRestored = 'folder.restored';
    case FolderDeleted = 'folder.deleted';
    /** {node_id, space_id?, from_parent_id, to_parent_id, via?} — и перестановка внутри той же папки */
    case NavNodeMoved = 'nav_node.moved';
    /** {node_id, space_id?} — сама иконка в журнал не пишется */
    case NavNodeIconChanged = 'nav_node.icon_changed';

    // Справочник типов карточек
    case CardTypeCreated = 'card_type.created';
    case CardTypeUpdated = 'card_type.updated';
    case CardTypeArchived = 'card_type.archived';
    case CardTypeRestored = 'card_type.restored';

    // Метки (общие компании и метки пространств)
    case LabelCreated = 'label.created';
    case LabelUpdated = 'label.updated';
    case LabelArchived = 'label.archived';
    case LabelRestored = 'label.restored';

    // Доски
    case BoardCreated = 'board.created';
    case BoardUpdated = 'board.updated';
    case BoardMoved = 'board.moved';
    case BoardArchived = 'board.archived';
    case BoardRestored = 'board.restored';

    // Колонки
    case ColumnCreated = 'column.created';
    case ColumnRenamed = 'column.renamed';
    case ColumnMoved = 'column.moved';
    case ColumnCategoryChanged = 'column.category_changed';
    case ColumnArchived = 'column.archived';

    // Дорожки
    case LaneCreated = 'lane.created';
    case LaneRenamed = 'lane.renamed';
    case LaneMoved = 'lane.moved';
    case LaneArchived = 'lane.archived';

    // Карточки
    case CardCreated = 'card.created';
    case CardUpdated = 'card.updated';
    /** Смена положения или категории — дублирует запись card_transitions для общей ленты истории. */
    case CardMoved = 'card.moved';
    /** Перестановка внутри той же ячейки (не переход). */
    case CardReordered = 'card.reordered';
    case CardArchived = 'card.archived';
    case CardRestored = 'card.restored';
    /** В корзину (ADR-0015); subject — карточка, payload пустой. */
    case CardDeleted = 'card.deleted';
    /** Из корзины на прежнее место; subject — карточка, payload пустой. */
    case CardRestoredFromTrash = 'card.restored_from_trash';
    case CardParticipantAdded = 'card.participant_added';
    case CardParticipantRemoved = 'card.participant_removed';
    case CardLabelsChanged = 'card.labels_changed';

    // Содержимое карточки (subject — карточка, в payload — только id)
    case CardCommentAdded = 'card.comment_added';
    case CardCommentEdited = 'card.comment_edited';
    case CardCommentDeleted = 'card.comment_deleted';
    case CardChecklistAdded = 'card.checklist_added';
    case CardChecklistRenamed = 'card.checklist_renamed';
    case CardChecklistRemoved = 'card.checklist_removed';
    case CardChecklistItemAdded = 'card.checklist_item_added';
    case CardChecklistItemEdited = 'card.checklist_item_edited';
    case CardChecklistItemChecked = 'card.checklist_item_checked';
    case CardChecklistItemUnchecked = 'card.checklist_item_unchecked';
    case CardChecklistItemMoved = 'card.checklist_item_moved';
    case CardChecklistItemRemoved = 'card.checklist_item_removed';
    case CardLinkAdded = 'card.link_added';
    case CardLinkUpdated = 'card.link_updated';
    case CardLinkRemoved = 'card.link_removed';
    case CardAttachmentAdded = 'card.attachment_added';
    case CardAttachmentRemoved = 'card.attachment_removed';

    // Связи и блокировки (ADR-0011). Связь пишется у обеих карточек: {relation_id, kind, card_id},
    // kind — кем приходится вторая карточка (parent/child). Текст причины блокировки в журнал не пишется
    case CardRelationAdded = 'card.relation_added';
    case CardRelationRemoved = 'card.relation_removed';
    case CardBlocked = 'card.blocked';
    case CardUnblocked = 'card.unblocked';

    /** События входа: к ним EventRecorder пишет IP и user agent в auth_audit. */
    public function isAuth(): bool
    {
        return str_starts_with($this->value, 'auth.');
    }
}
