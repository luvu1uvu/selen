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
 * Режим копии Selen (ADR-0026): несколько компаний — экран «Компании» у Владельца и гости компании; одна компания
 * (по умолчанию) — их нет нигде. Режим сообщает API (`/auth/me`), а не сборка.
 */
export function isMultiCompany(user: Pick<User, 'multi_company'> | null | undefined): boolean {
  return user?.multi_company === true
}

/**
 * Контекст i18next для текстов, которые в режиме «одна компания» звучат иначе (без других компаний и гостей): ключ
 * `…_single`, если он есть, иначе обычный.
 */
export function companyModeContext(
  user: Pick<User, 'multi_company'> | null | undefined,
): 'single' | undefined {
  return isMultiCompany(user) ? undefined : 'single'
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
