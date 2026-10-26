import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useParams } from 'react-router'
import { useCurrentUser } from '@/features/auth/queries'
import { NotFoundState } from '@/shared/components/NotFoundState'
import { adminCompanies } from '@/shared/lib/roles'
import { AdminCompanyContext, rememberAdminCompany } from './company'

/**
 * Админка компании /admin/c/:companyId/… (ADR-0024): компания из адреса — для запросов, ключей кеша и ссылок страниц
 * (`AdminCompanyContext`) и запоминается как последняя выбранная. Чужая или несуществующая компания — «Страница
 * не найдена», одинаково (API ответил бы 404 так же).
 */
export function AdminCompanyLayout() {
  const { t } = useTranslation()
  const { companyId = '' } = useParams()
  const { data: user } = useCurrentUser()
  const known = adminCompanies(user).some((company) => company.id === companyId)

  useEffect(() => {
    if (known && user) rememberAdminCompany(user.id, companyId)
  }, [known, user, companyId])

  if (!known) {
    return <NotFoundState title={t('errors.notFoundTitle')} text={t('errors.notFoundText')} />
  }

  return (
    <AdminCompanyContext.Provider value={companyId}>
      <Outlet />
    </AdminCompanyContext.Provider>
  )
}
