import type { RoleKey } from '@/shared/types/api'

/** Стандартные роли в порядке списка ролей (ADR-0024): сначала роли на все карточки, затем «только свои». */
export const ROLE_KEYS: RoleKey[] = ['admin', 'editor', 'commenter', 'editor_own', 'commenter_own']

/** Роли с «управлением доступом» — их не выдают гостю и группе «Все сотрудники» (ADR-0024). */
export const MANAGING_ROLES: RoleKey[] = ['admin']

/** Роли в порядке списка ролей. */
export function sortRoles(roles: RoleKey[]): RoleKey[] {
  return ROLE_KEYS.filter((role) => roles.includes(role))
}
