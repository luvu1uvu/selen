/** Типы ответов API /api/v1. Держим в синхроне с app/Http/Resources на backend. */

import type { RichTextDoc } from '@/shared/components/rich-text/doc'

/**
 * Роль для интерфейса (ADR-0017, ADR-0024): owner — Владелец; admin — у текущего пользователя администратор хотя бы
 * одной компании, у людей админки — администратор этой компании (`isSystemAdmin`); member — участник.
 */
export type UserRole = 'owner' | 'admin' | 'member'
/** Роль, которую назначают сменой роли и приглашением; Владелец — только передачей владения. */
export type AssignableRole = Exclude<UserRole, 'owner'>
export type UserStatus = 'invited' | 'active' | 'deactivated'
/** Тема оформления (App\Enums\Theme, ADR-0025). */
export type Theme = 'light' | 'dark' | 'system'
export type InvitationState = 'pending' | 'expired' | 'accepted' | 'revoked' | 'superseded'

export interface UserRef {
  id: string
  name: string
}

export interface InvitationSummary {
  id: string
  state: InvitationState
  expires_at: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  timezone: string
  /** Тема оформления — только у текущего пользователя (`/auth/me`, вход, профиль); в админских списках её нет. */
  theme?: Theme
  last_login_at: string | null
  deactivated_at: string | null
  created_at: string
  /** Последнее приглашение пользователя — только в админских ответах. */
  invitation?: InvitationSummary | null
  /** Компании, которыми управляет текущий пользователь (только `/auth/me` и вход), — адреса и меню админки. */
  admin_companies?: AdminCompany[]
}

/** Право компании (App\Enums\Permission, область company, ADR-0024). */
export type CompanyPermission =
  | 'company.invite_users'
  | 'company.manage_users'
  | 'company.delete_users'
  | 'company.manage_groups'
  | 'company.manage_dictionaries'
  | 'company.manage_roles'
  | 'company.manage_structure'
  | 'company.manage_access'
  | 'company.view_event_log'
  | 'company.manage_trash'
  | 'company.view_time_analytics'

/**
 * Компания, которой управляет текущий пользователь (`/auth/me`, ADR-0024): название — только если их несколько
 * (выбор компании); права — пункты меню админки.
 */
export interface AdminCompany {
  id: string
  name: string | null
  permissions: CompanyPermission[]
}

/** Компания на экране Владельца «Компании»: люди («дома» без деактивированных) и администраторы. */
export interface Company {
  id: string
  name: string
  created_at: string
  people_count: number
  admins: { id: string; name: string; email: string; status: UserStatus }[]
}

/** Что текущий администратор может сделать с пользователем (UserPolicy, ADR-0017) — подсказка интерфейсу. */
export interface AdminUserPermissions {
  update_role: boolean
  /** Деактивировать и вернуть — в этой компании (П2c). */
  deactivate: boolean
  reactivate: boolean
  /** Повторить или отозвать приглашение пользователя. */
  manage_invitation: boolean
  transfer_ownership: boolean
  /** Отключить и включить учётную запись — только Владелец (П2c). */
  block: boolean
  /** Изменить срок и пространства гостя, убрать гостя (право «управлять пользователями»). */
  manage_guest: boolean
  /** Вкладка «Права компании» (Владелец и администратор компании). */
  manage_permissions: boolean
}

/** Гость компании (П2c): срок (null — без срока) и истёк ли. */
export interface GuestMembership {
  expires_at: string | null
  expired: boolean
}

/**
 * Пользователь в админке «Пользователи»: статус — в этой компании (убранный из неё — deactivated). Время входа и часовой
 * пояс приходят только у действующих сотрудников компании (иначе null).
 */
export interface AdminUser extends Omit<User, 'timezone'> {
  timezone: string | null
  /** Гость этой компании; null — сотрудник или Владелец. */
  guest: GuestMembership | null
  /** Учётную запись отключил Владелец (вернуть может только он). */
  blocked: boolean
  permissions: AdminUserPermissions
}

/** Фильтр «Пользователей» по статусу в компании. */
export type UserStatusFilter = UserStatus | 'guest'

/** Итог приглашения: invited — ушла ссылка задать пароль; added — существующий сотрудник сразу добавлен (П2c). */
export interface InviteResult {
  result: 'invited' | 'added'
  user: UserRef
  invitation: Invitation | null
}

/** Пространство, где можно выдать доступ приглашённому и гостю. */
export interface GrantableSpace {
  id: string
  key: string
  name: string
}

/** Доступ к пространству в приглашении и у гостя. */
export interface SpaceGrantInput {
  space_id: string
  role: SpaceRole
  own_cards_only?: boolean
}

/** Право компании у человека (вкладка «Права компании», П2c). */
export interface UserCompanyPermission {
  permission: CompanyPermission
  /** Выдано лично. */
  personal: boolean
  /** Через какие группы. */
  groups: UserRef[]
  /** Есть у администратора компании по умолчанию. */
  by_admin_role: boolean
  /** Итог: право есть. */
  effective: boolean
  /** Может ли текущий пользователь менять галочку. */
  editable: boolean
}

/** Право компании у группы. */
export interface GroupCompanyPermission {
  permission: CompanyPermission
  granted: boolean
  editable: boolean
}

/** Что потеряет Владелец при передаче владения (П2c). */
export interface TransferImpact {
  lost_spaces: { id: string; key: string; name: string }[]
  unmanaged_spaces: { id: string; key: string; name: string }[]
}

export interface Invitation {
  id: string
  user_id: string
  name: string
  email: string
  role: UserRole
  state: InvitationState
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
  invited_by: UserRef | null
  /** Можно ли отправить приглашение повторно (последнее приглашение и пользователь ещё не активирован). */
  can_resend: boolean
  /** Можно ли отозвать (ожидает принятия или истекло). */
  can_revoke: boolean
}

export interface EventLogEntry {
  id: number
  event_type: string
  occurred_at: string
  actor: UserRef | null
  subject_type: string | null
  subject_id: string | null
  payload: Record<string, unknown>
  meta: { source?: 'http' | 'console' }
  /** IP и user agent — только у событий входа и только в пределах срока хранения auth_audit. */
  auth_audit: { ip: string | null; user_agent: string | null } | null
}

export type SpaceRole = 'admin' | 'editor' | 'commenter'

/** Пространство глазами участника (SpaceResource). */
export interface Space {
  id: string
  key: string
  name: string
  /** Компания пространства (ADR-0024): справочники людей и групп для выдачи доступа — по ней. */
  company_id: string
  description: string | null
  archived_at: string | null
  my_role: SpaceRole | null
  /** Подсказка для интерфейса; реальный доступ проверяет API. */
  permissions: {
    manage: boolean
    edit_cards: boolean
    /** Видеть источники доступа (вкладка «Группы»): нет у пользователя только с «только своими карточками». */
    view_access_sources: boolean
  }
  /** Активные доски — только в списке пространств (сайдбар). */
  boards?: BoardSummary[]
}

export type ColumnCategory = 'queue' | 'in_progress' | 'done'
export type BoardTemplate = 'simple' | 'development' | 'empty'

export interface BoardSummary {
  id: string
  space_id: string
  /** Ряд на странице пространства; position — порядок внутри ряда (ADR-0019). */
  row_id: string
  name: string
  description: string | null
  position: string
  archived_at: string | null
}

/** Доска в списке пространства (страница пространства): без карточек, в порядке раскладки (ряд, место в ряду). */
export interface SpaceBoard extends BoardSummary {
  /** Колонки без подколонок — ширина доски без загрузки карточек. */
  leaf_columns_count: number
  /** Активные карточки, видимые пользователю (ADR-0008), — счётчик свёрнутой доски. */
  cards_count: number
  /** Пользователь свернул доску у себя (личный вид, ADR-0019). */
  collapsed: boolean
}

/** Колонка доски: сначала колонка первого уровня, за ней её подколонки. category — действующий тип. */
export interface BoardColumn {
  id: string
  parent_id: string | null
  name: string
  category: ColumnCategory
  position: string
}

export interface Lane {
  id: string
  name: string
  position: string
}

/** Карточка на доске (фасад). Порядок в массиве — порядок в ячейке. */
export interface BoardCard {
  id: string
  key: string
  title: string
  column_id: string
  lane_id: string
  position: string
  card_type_id: string
  /** Метки по порядку: сначала общие, затем пространства. Сами метки — в BoardDetail.labels. */
  label_ids: string[]
  /** Ответственный; имя — в BoardDetail.people. */
  responsible_id: string | null
  /** Срок: дата без времени (YYYY-MM-DD) или момент (UTC) — не оба сразу. */
  due_date: string | null
  due_at: string | null
  completed_at: string | null
  is_urgent: boolean
  /** Прогресс чек-листов; null — чек-листов нет. */
  checklist: { done: number; total: number } | null
  comments_count: number
  attachments_count: number
  /** Есть активная блокировка — карточка выделяется на доске. */
  is_blocked: boolean
  /** Можно ли менять и перемещать: при доступе «только свои карточки» — только свои (ADR-0012). */
  can_edit: boolean
}

/** Человек на фасаде карточки. */
export interface BoardPerson {
  id: string
  name: string
  status: UserStatus
}

/** Метка: общая метка компании или метка пространства. Архивная остаётся на карточках. */
export interface Label {
  id: string
  name: string
  color: string
  scope: 'company' | 'space'
  archived_at: string | null
}

/** Человек в карточке: in_space = false — исключён из пространства, но остаётся на карточке. */
export interface CardPerson {
  id: string
  name: string
  status: UserStatus
  in_space: boolean
}

export interface BoardDetail {
  id: string
  name: string
  description: string | null
  archived_at: string | null
  space: { id: string; key: string; name: string }
  /** delete_cards — удалять карточки в корзину: системный администратор, доска и пространство не в архиве. */
  permissions: { manage: boolean; edit_cards: boolean; delete_cards: boolean }
  /** Переместивший в «в работе»/«готово» становится ответственным или участником. */
  auto_assign_on_move: boolean
  has_done_column: boolean
  columns: BoardColumn[]
  lanes: Lane[]
  /** Дорожки, которые пользователь у себя свернул (личный вид, ADR-0019), — в порядке дорожек. */
  collapsed_lane_ids: string[]
  /** Только карточки, видимые пользователю (режим «только свои карточки»). */
  cards: BoardCard[]
  card_types: CardType[]
  /** Справочники для фасадов: метки и ответственные с карточек доски. */
  labels: Label[]
  people: BoardPerson[]
}

export interface CardDetail {
  id: string
  key: string
  number: number
  title: string
  /** Документ визуального редактора; null — описания нет. */
  description: RichTextDoc | null
  /** Имена упомянутых в описании (в документе — только id). */
  mentioned_users: Record<string, string>
  space: { id: string; key: string; name: string }
  board: { id: string; name: string }
  column: { id: string; name: string; parent_name: string | null; category: ColumnCategory }
  lane: { id: string; name: string }
  card_type: CardType
  created_by: UserRef
  customer: CardPerson
  responsible: CardPerson | null
  participants: CardPerson[]
  labels: Label[]
  due_date: string | null
  due_at: string | null
  is_urgent: boolean
  /** План в часах, шаг 0,5. */
  estimate_hours: number | null
  checklists: Checklist[]
  links: CardLink[]
  attachments: Attachment[]
  relations: {
    parents: CardRelation[]
    children: CardRelation[]
    /** Дочерние в «готово» из всех активных; null — дочерних нет. */
    progress: { done: number; total: number } | null
  }
  /** Эпизоды блокировки, новые сверху: активные (ended_at = null) и история. */
  blocks: CardBlock[]
  created_at: string
  first_started_at: string | null
  completed_at: string | null
  /** Последнее перемещение в другое место (колонка, дорожка, доска); null — карточку не перемещали. */
  moved_at: string | null
  archived_at: string | null
  /** Из истории переходов, секунды; null — карточка не завершена. */
  metrics: { lead_time_seconds: number | null; cycle_time_seconds: number | null }
  /**
   * edit — поля, люди, чек-листы, ссылки; comment — комментарии и файлы (все роли, включая commenter);
   * restricted — для зрителя действует режим «только свои карточки».
   */
  /** delete — удалить в корзину: только системный администратор (ADR-0015). */
  permissions: { edit: boolean; comment: boolean; restricted: boolean; delete: boolean }
}

/**
 * Связанная карточка глазами зрителя. hidden — пользователь её не видит (режим «только свои карточки»):
 * «Скрытая карточка» без номера и названия; deleted — карточка в корзине: «Удалённая карточка» (ADR-0015).
 */
export type RelatedCard =
  | { hidden: true; deleted?: true }
  | {
      hidden: false
      id: string
      key: string
      title: string
      category: ColumnCategory
      archived: boolean
    }

export interface CardRelation {
  id: string
  card: RelatedCard
}

/** blocker_deleted — блокирующую карточку удалили в корзину (ADR-0015). */
export type BlockEndReason = 'manual' | 'blocker_completed' | 'blocker_deleted'

export interface CardBlock {
  id: string
  reason: string | null
  blocking_card: RelatedCard | null
  started_at: string
  started_by: UserRef
  ended_at: string | null
  ended_by: UserRef | null
  end_reason: BlockEndReason | null
}

/** Карточка в поиске и архиве. */
export interface CardSummary {
  id: string
  key: string
  title: string
  board: { id: string; name: string }
  column: { name: string; category: ColumnCategory }
  archived_at: string | null
}

/** Запись ленты истории: перемещение (card_transitions) или событие журнала по карточке. */
export type CardHistoryItem =
  | { id: string; kind: 'transition'; at: string; transition: CardTransition }
  | {
      id: string
      kind: 'event'
      at: string
      actor: UserRef | null
      event_type: string
      payload: Record<string, unknown>
    }

/**
 * Лента истории. В журнале только id — подписи в справочниках; id скрытой карточки в payload
 * заменён на «hidden».
 */
export interface CardHistory {
  data: CardHistoryItem[]
  refs: {
    users: Record<string, string>
    card_types: Record<string, string>
    labels: Record<string, { name: string; color: string }>
    blocks: Record<string, string | null>
    cards: Record<string, Extract<RelatedCard, { hidden: false }>>
  }
}

export interface ChecklistItem {
  id: string
  text: string
  is_done: boolean
}

export interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
}

export interface CardLink {
  id: string
  url: string
  title: string | null
}

/**
 * Вложение. Файл — по url (`/files/{id}`: через приложение, с проверкой доступа при каждом открытии; открывается и
 * напрямую — UI-1b); картинки, видео и PDF — в браузере, `?download=1` — скачать. mime — только у безопасных встроенных
 * типов.
 */
export interface Attachment {
  id: string
  name: string
  mime: string | null
  size: number
  kind: 'image' | 'video' | 'file'
  url: string
  /** Открывается в браузере (картинки, видео, PDF по содержимому): имя — в новой вкладке, иначе — скачивание. */
  opens_in_browser: boolean
  uploaded_by: UserRef
  created_at: string
  permissions: { delete: boolean }
}

export interface Comment {
  id: string
  author: { id: string; name: string; status: UserStatus }
  /** null — комментарий удалён. */
  body: RichTextDoc | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  permissions: { modify: boolean }
}

/** Список комментариев и имена упомянутых в них. */
export interface CommentList {
  data: Comment[]
  users: Record<string, string>
}

export type TransitionReason = 'created' | 'manual' | 'column_type_changed' | 'column_split'

export interface CardTransition {
  id: number
  moved_at: string
  reason: TransitionReason
  actor: UserRef | null
  from_board: { id: string; name: string } | null
  to_board: { id: string; name: string }
  from_column: { id: string; name: string } | null
  to_column: { id: string; name: string }
  from_lane: { id: string; name: string } | null
  to_lane: { id: string; name: string }
  from_category: ColumnCategory | null
  to_category: ColumnCategory
}

/** Источник доступа через группу у человека в пространстве. */
export interface PersonGroupSource {
  id: string
  name: string
  role: SpaceRole
  own_cards_only: boolean
}

/**
 * Человек с доступом к пространству — лично и/или через группы (ADR-0012).
 * Пользователю только с режимом «только свои карточки» источники не отдаются: есть только user.
 */
export interface SpacePerson {
  /** status — в компании пространства; guest — гость компании (бейдж, П2c). */
  user: { id: string; name: string; email: string; status: UserStatus; guest: boolean }
  /** Самая сильная роль по всем источникам (для показа). */
  role?: SpaceRole
  /** Личное участие; null — доступ только через группы. */
  personal?: {
    role: SpaceRole
    /** Режим «только свои карточки»: видит только карточки, где он заказчик, ответственный или участник. */
    own_cards_only: boolean
    added_at: string
  } | null
  groups?: PersonGroupSource[]
}

/** Доступ группы к пространству (вкладка «Группы»). */
/** Встроенная группа: состав вычисляется (все активные сотрудники), группа не редактируется. */
export type SystemGroup = 'everyone'

export interface SpaceGroupGrant {
  group: {
    id: string
    name: string
    description: string | null
    system: SystemGroup | null
    archived_at: string | null
    members_count: number
  }
  role: SpaceRole
  own_cards_only: boolean
  added_at: string
}

/** Группа в справочнике для выдачи доступа (только активные). */
export interface DirectoryGroup {
  id: string
  name: string
  description: string | null
  system: SystemGroup | null
  members_count: number
}

/** Группа в админке; состав и доступы — на странице группы. */
export interface Group {
  id: string
  name: string
  description: string | null
  system: SystemGroup | null
  archived_at: string | null
  created_at: string
  members_count: number
  spaces_count: number
  members?: (DirectoryUser & { added_at: string })[]
  spaces?: {
    space: { id: string; key: string; name: string; archived_at: string | null }
    role: SpaceRole
    own_cards_only: boolean
  }[]
}

export type AccessInactiveReason =
  'group_archived' | 'user_deactivated' | 'user_invited' | 'guest_expired'

/** Админка → пользователь: к каким пространствам доступ и почему. */
export interface UserAccess {
  user: { id: string; name: string; email: string; role: UserRole; status: UserStatus }
  groups: { id: string; name: string; archived_at: string | null }[]
  spaces: {
    space: { id: string; key: string; name: string; archived_at: string | null }
    has_access: boolean
    role: SpaceRole | null
    sees_all_cards: boolean
    sources: {
      type: 'personal' | 'group'
      group: { id: string; name: string } | null
      role: SpaceRole
      own_cards_only: boolean
      inactive_reason: AccessInactiveReason | null
    }[]
  }[]
}

/** Что будет после деактивации: пространства, где он последний личный администратор. */
export interface DeactivationImpact {
  last_admin_spaces: { id: string; key: string; name: string; archived_at: string | null }[]
}

/** Пространство в админке системного администратора (AdminSpaceResource): только метаданные. */
export interface AdminSpace {
  id: string
  key: string
  name: string
  description: string | null
  /** Иконка-эмодзи из дерева навигации. */
  icon: string | null
  archived_at: string | null
  created_at: string
  admins: { id: string; name: string; status: UserStatus }[]
  members_count: number
  groups_count: number
  /** Есть личный не деактивированный администратор (инвариант ADR-0012). */
  has_active_admin: boolean
  my_role: SpaceRole | null
}

/**
 * Дерево навигации одной компании (GET /navigation, ADR-0013, ADR-0024): ответ — деревья компаний, где пользователю есть
 * что показать; название — только если таких компаний несколько (заголовки в дереве).
 */
export interface NavCompanyTree {
  id: string
  name: string | null
  items: NavTreeNode[]
}

/** Узел дерева навигации пользователя (GET /navigation, ADR-0013). */
export type NavTreeNode = NavTreeFolder | NavTreeSpace

export interface NavTreeFolder {
  type: 'folder'
  id: string
  name: string
  icon: string | null
  /** Все активные пространства папки открыты группе «Все сотрудники». */
  everyone: boolean
  /** В папке нет ни одного пространства на любой глубине — такие папки приходят только Владельцу (ADR-0017). */
  empty: boolean
  children: NavTreeNode[]
}

export interface NavTreeSpace {
  type: 'space'
  id: string
  icon: string | null
  /** Пространство открыто группе «Все сотрудники». */
  everyone: boolean
  space: { id: string; key: string; name: string }
  /** Пользователь управляет пространством (создаёт доски) — как permissions.manage. */
  can_manage: boolean
  boards: { id: string; name: string }[]
}

/** Узел полного дерева в админке «Структура» (плоский список в порядке обхода). */
export interface AdminNavNode {
  id: string
  parent_id: string | null
  type: 'folder' | 'space'
  name: string | null
  icon: string | null
  depth: number
  archived_at: string | null
  everyone: boolean
  space: { id: string; key: string; name: string; archived_at: string | null } | null
}

export interface AdminNavigation {
  data: AdminNavNode[]
  meta: { max_depth: number; created_id?: string }
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
  status: UserStatus
}

export interface CardType {
  id: string
  name: string
  color: string
  is_default: boolean
  archived_at: string | null
}

export interface Collection<T> {
  data: T[]
}

export interface PublicInvitation {
  name: string
  email: string
  expires_at: string
}

export interface Paginated<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export interface Resource<T> {
  data: T
}

/** Карточка в «Администрирование → Корзина» (ADR-0015): только системному администратору. */
export interface TrashedCard {
  id: string
  key: string
  /** null — у администратора нет доступа к пространству: название скрыто (title_hidden). */
  title: string | null
  title_hidden: boolean
  space: { id: string; key: string; name: string }
  board: { id: string; name: string }
  /** Удалена из архива — туда же и вернётся. */
  archived: boolean
  /** null — уже восстановлена (ответ на восстановление). */
  deleted_at: string | null
  deleted_by: { id: string; name: string } | null
}
