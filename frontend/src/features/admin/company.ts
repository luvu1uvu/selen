import { createContext, useContext } from 'react'
import { useCurrentUser } from '@/features/auth/queries'
import { adminCompanies } from '@/shared/lib/roles'
import type { AdminCompany, CompanyPermission, User } from '@/shared/types/api'

/**
 * Компания админки (ADR-0024): адреса страниц /admin/c/{id}/…, API — admin/companies/{id}/…, ключи кеша — с её id.
 * Задаёт её маршрут /admin/c/:companyId (AdminCompanyLayout) или дерево сайдбара (своё у каждой компании) —
 * `<AdminCompanyContext.Provider value={id}>`. Вне них — компания по умолчанию (последняя выбранная или первая).
 */
export const AdminCompanyContext = createContext<string | null>(null)

/** Последняя выбранная в админке компания — для перехода в «Администрирование» и старых адресов /admin/…. */
function rememberedKey(userId: string) {
  return `selen.admin.company.${userId}`
}

export function rememberAdminCompany(userId: string, companyId: string) {
  try {
    window.localStorage.setItem(rememberedKey(userId), companyId)
  } catch {
    // Хранилище недоступно — по умолчанию будет первая компания
  }
}

/** Компания по умолчанию: последняя выбранная, если она ещё среди компаний пользователя, иначе первая. */
export function defaultAdminCompany(user: User | null | undefined): AdminCompany | undefined {
  const companies = adminCompanies(user)
  let remembered: string | null = null
  try {
    remembered = user ? window.localStorage.getItem(rememberedKey(user.id)) : null
  } catch {
    remembered = null
  }
  return companies.find((company) => company.id === remembered) ?? companies[0]
}

export function useAdminCompanyId(): string {
  const { data: user } = useCurrentUser()
  const fromContext = useContext(AdminCompanyContext)
  return fromContext ?? defaultAdminCompany(user)?.id ?? ''
}

/** Компания админки целиком: название (если компаний несколько) и права компании — пункты меню. */
export function useAdminCompany(): AdminCompany | undefined {
  const { data: user } = useCurrentUser()
  const id = useAdminCompanyId()
  return adminCompanies(user).find((company) => company.id === id)
}

export function hasCompanyPermission(
  company: AdminCompany | undefined,
  permission: CompanyPermission,
): boolean {
  return company?.permissions.includes(permission) ?? false
}

/** Адрес страницы админки компании: adminUrl(id, 'users') → /admin/c/{id}/users. */
export function adminUrl(companyId: string, path: string): string {
  return `/admin/c/${companyId}/${path}`
}

/** То же для текущей компании админки. */
export function useAdminUrl(): (path: string) => string {
  const company = useAdminCompanyId()
  return (path: string) => adminUrl(company, path)
}
