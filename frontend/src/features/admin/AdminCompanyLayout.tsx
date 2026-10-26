import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router'
import { AdminNotFound } from '@/app/guards'
import { useCurrentUser } from '@/features/auth/queries'
import { adminCompanies } from '@/shared/lib/roles'
import { AdminCompanyContext, rememberAdminCompany } from './company'

/**
 * Админка компании /admin/c/:companyId/… (ADR-0024): компания из адреса — для запросов, ключей кеша и ссылок страниц
 * (`AdminCompanyContext`) и запоминается как последняя выбранная. Чужая или несуществующая компания — «Страница
 * не найдена», одинаково (API ответил бы 404 так же).
 */
export function AdminCompanyLayout() {
  const { companyId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const known = adminCompanies(user).some((company) => company.id === companyId)

  useEffect(() => {
    if (known && user) rememberAdminCompany(user.id, companyId)
  }, [known, user, companyId])

  if (!known) return <AdminNotFound />

  // Другая компания — страница заново (key): без строк прошлой компании до ответа, фильтры и поиск — с начала
  // (аудит П2b-2, S-2)
  return (
    <AdminCompanyContext.Provider value={companyId}>
      <Outlet key={companyId} />
    </AdminCompanyContext.Provider>
  )
}
