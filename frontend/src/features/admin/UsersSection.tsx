import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { MailPlus, Users, UsersRound } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { CompanyPermission } from '@/shared/types/api'
import { hasCompanyPermission, useAdminCompany, useAdminUrl } from './company'

/**
 * Вкладки раздела «Пользователи» — как в Kaiten (LATER-114): значок над подписью, активная подчёркнута. Каждая вкладка —
 * своя страница (адрес /admin/c/{компания}/users | groups | invitations) и право компании; «Роли» (П2e) и «Запросы
 * на доступ» (LATER-114) встанут в этот список.
 */
const USERS_TABS: {
  path: 'users' | 'groups' | 'invitations'
  icon: typeof Users
  permission: CompanyPermission
}[] = [
  { path: 'users', icon: Users, permission: 'company.manage_users' },
  { path: 'groups', icon: UsersRound, permission: 'company.manage_groups' },
  { path: 'invitations', icon: MailPlus, permission: 'company.invite_users' },
]

/** Раздел «Пользователи» админки компании: заголовок и вкладки над страницей вкладки. */
export function UsersSection() {
  const { t } = useTranslation('admin')
  const company = useAdminCompany()
  const url = useAdminUrl()
  const tabs = USERS_TABS.filter((tab) => hasCompanyPermission(company, tab.permission))

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
        <nav aria-label={t('users.tabs.label')} className="flex gap-1 overflow-x-auto border-b">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={url(tab.path)}
              className={({ isActive }) =>
                cn(
                  'text-muted-foreground hover:text-foreground focus-visible:ring-ring -mb-px flex min-w-24 shrink-0 flex-col items-center gap-1 border-b-2 border-transparent px-3 pt-1 pb-2 text-sm transition-colors outline-none focus-visible:ring-[3px]',
                  isActive && 'border-primary text-foreground font-medium',
                )
              }
            >
              <tab.icon aria-hidden className="size-5" />
              {t(`users.tabs.${tab.path}`)}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
