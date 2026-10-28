import type { AdminCompany, User } from '@/shared/types/api'

type WithRole = Pick<User, 'role'> | null | undefined

/**
 * Администратор компании или Владелец (ADR-0017, ADR-0024): role — роль для интерфейса (у текущего пользователя admin —
 * администратор хотя бы одной компании, у людей в админке — роль в этой компании). Доступ всё равно проверяет API.
 */
export function isSystemAdmin(user: WithRole): boolean {
  return user?.role === 'admin' || user?.role === 'owner'
}

/** Владелец — единственный; назначает администраторов и передаёт владение (ADR-0017). */
export function isOwner(user: WithRole): boolean {
  return user?.role === 'owner'
}

/**
 * Компании, которыми текущий пользователь управляет (Владелец — всеми), по дате создания — адреса админки
 * /admin/c/{id}/… и API admin/companies/{id}/… (ADR-0024). Названия — только если их несколько.
 */
export function adminCompanies(
  user: Pick<User, 'admin_companies'> | null | undefined,
): AdminCompany[] {
  return user?.admin_companies ?? []
}

/**
 * Есть ли у текущего пользователя «Администрирование»: Владелец, администратор компании или участник, которому выданы
 * права компании (лично или через группу, П2c) — тогда в меню только его разделы.
 */
export function hasAdminAccess(
  user: (WithRole & Pick<User, 'admin_companies'>) | null | undefined,
): boolean {
  return isSystemAdmin(user) || adminCompanies(user).length > 0
}
