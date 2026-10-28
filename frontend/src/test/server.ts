import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type {
  AdminUser,
  AdminUserPermissions,
  CompanyPermission,
  NavCompanyTree,
  NavTreeNode,
  NavTreeSpace,
  Space,
  User,
} from '@/shared/types/api'

/** Компания тестов («Компания 1», ADR-0024): адреса админки — admin/companies/{id}/…. */
export const TEST_COMPANY_ID = '01JTESTCOMPANY0000000000000'

/** Права администратора компании по умолчанию (Permission::companyAdminDefaults, ADR-0024). */
export const COMPANY_ADMIN_PERMISSIONS: CompanyPermission[] = [
  'company.invite_users',
  'company.manage_users',
  'company.manage_groups',
  'company.manage_dictionaries',
  'company.manage_roles',
  'company.manage_structure',
  'company.manage_access',
  'company.view_event_log',
  'company.manage_trash',
]

/** Фабрика пользователя для тестов: администратор (и Владелец) управляет компанией тестов. */
export function makeUser(overrides: Partial<User> = {}): User {
  const role = overrides.role ?? 'admin'
  return {
    id: '01JTESTUSER0000000000000000',
    name: 'Анна Админова',
    email: 'admin@selen.test',
    role,
    status: 'active',
    timezone: 'Europe/Moscow',
    theme: 'light',
    last_login_at: null,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
    admin_companies:
      role === 'member'
        ? []
        : [{ id: TEST_COMPANY_ID, name: null, permissions: COMPANY_ADMIN_PERMISSIONS }],
    ...overrides,
  }
}

/** Права строки админки «Пользователи» глазами Владельца на участника (UserPolicy, ADR-0017). */
export const ALL_USER_PERMISSIONS: AdminUserPermissions = {
  update_role: true,
  deactivate: true,
  reactivate: true,
  manage_invitation: true,
  transfer_ownership: true,
  block: true,
  transfer_access: true,
  manage_guest: false,
  manage_permissions: true,
}

export const NO_USER_PERMISSIONS: AdminUserPermissions = {
  update_role: false,
  deactivate: false,
  reactivate: false,
  manage_invitation: false,
  transfer_ownership: false,
  block: false,
  transfer_access: false,
  manage_guest: false,
  manage_permissions: false,
}

/** Пользователь в админском списке (AdminUserResource): по умолчанию — со всеми действиями. */
export function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    ...makeUser(),
    guest: null,
    blocked: false,
    permissions: ALL_USER_PERMISSIONS,
    ...overrides,
  }
}

/** Фабрика пространства (глазами участника) для тестов. */
export function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: '01JTESTSPACE000000000000000',
    key: 'DEV',
    name: 'Разработка',
    company_id: TEST_COMPANY_ID,
    description: null,
    archived_at: null,
    my_role: 'admin',
    permissions: { manage: true, edit_cards: true, view_access_sources: true },
    ...overrides,
  }
}

/**
 * Ответ GET /navigation: деревья по компаниям (ADR-0024); у пользователя тестов компания одна — одно дерево без
 * названия; пусто — без деревьев.
 */
export function navTree(items: NavTreeNode[]): { data: NavCompanyTree[] } {
  return { data: items.length === 0 ? [] : [{ id: TEST_COMPANY_ID, name: null, items }] }
}

/** Узел пространства в дереве навигации (GET /navigation) для тестов. */
export function makeNavSpace(space: Space, overrides: Partial<NavTreeSpace> = {}): NavTreeSpace {
  return {
    type: 'space',
    id: `node-${space.key}`,
    icon: null,
    everyone: false,
    space: { id: space.id, key: space.key, name: space.name },
    can_manage: space.permissions.manage,
    boards: [],
    ...overrides,
  }
}

/**
 * Обработчики по умолчанию: CSRF-cookie всегда доступна, пользователь не вошёл,
 * пространств, досок, сотрудников, комментариев, участников и меток нет (их запрашивают сайдбар,
 * страницы, диалоги и панель карточки).
 */
export const defaultHandlers = [
  http.get('*/sanctum/csrf-cookie', () => new HttpResponse(null, { status: 204 })),
  http.get('*/api/v1/auth/me', () =>
    HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
  ),
  http.get('*/api/v1/spaces', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/navigation', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/admin/companies/:company/navigation', () =>
    HttpResponse.json({ data: [], meta: { max_depth: 4 } }),
  ),
  http.get('*/api/v1/spaces/:key/boards', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/companies/:company/users/directory', () => HttpResponse.json({ data: [] })),
  // Панель карточки: комментарии, участники и метки пространства — пусто, если тест не задал своё
  http.get('*/api/v1/cards/:key/comments', () => HttpResponse.json({ data: [], users: {} })),
  http.get('*/api/v1/spaces/:key/members', () => HttpResponse.json({ data: [] })),
  http.get('*/api/v1/spaces/:key/labels', () => HttpResponse.json({ data: [] })),
  // Передача владения: Владелец ничего не теряет, если тест не задал своё
  http.get('*/api/v1/admin/companies/:company/users/:user/transfer-impact', () =>
    HttpResponse.json({ data: { lost_spaces: [], unmanaged_spaces: [] } }),
  ),
  // П2c: пространства, где можно выдавать доступ, и права компании — пусто, если тест не задал своё
  http.get('*/api/v1/admin/companies/:company/grantable-spaces', () =>
    HttpResponse.json({ data: [] }),
  ),
  http.get('*/api/v1/admin/companies/:company/users/:user/permissions', () =>
    HttpResponse.json({ data: [] }),
  ),
  http.get('*/api/v1/admin/companies/:company/groups/:group/permissions', () =>
    HttpResponse.json({ data: [] }),
  ),
]

export const server = setupServer(...defaultHandlers)

/** Подменить /auth/me: вернуть указанного пользователя. */
export function signedInAs(user: User) {
  server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ data: user })))
}
