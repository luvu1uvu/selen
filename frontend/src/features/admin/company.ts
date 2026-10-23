import { useCurrentUser } from '@/features/auth/queries'
import { adminCompanies } from '@/shared/lib/roles'

/**
 * Компания админки (ADR-0024): адреса API — admin/companies/{id}/…. Пока компания одна — первая из тех, которыми
 * пользователь управляет (`/auth/me` → admin_companies); выбор компании и ключи кеша с компанией — П2b-2.
 * Админка открыта только администраторам (RequireAdmin), так что компания есть.
 */
export function useAdminCompanyId(): string {
  const { data: user } = useCurrentUser()
  return adminCompanies(user)[0] ?? ''
}
