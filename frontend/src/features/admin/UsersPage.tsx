import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { isOwner } from '@/shared/lib/roles'
import { InvitationsTable } from './components/InvitationsTable'
import { InviteUserDialog } from './components/InviteUserDialog'
import { TransferOwnershipDialog } from './components/TransferOwnershipDialog'
import { UsersTable } from './components/UsersTable'
import { hasCompanyPermission, useAdminCompany } from './company'

/** Вкладка «Пользователи» раздела «Пользователи»: люди компании, приглашение, передача владения (Владелец). */
export function UsersPage() {
  const { t } = useTranslation('admin')
  const { data: me } = useCurrentUser()
  const company = useAdminCompany()

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <p className="text-muted-foreground text-sm">{t('users.description')}</p>
        <div className="flex flex-wrap gap-2">
          {isOwner(me) && <TransferOwnershipDialog />}
          {hasCompanyPermission(company, 'company.invite_users') && <InviteUserDialog />}
        </div>
      </div>
      <UsersTable />
    </div>
  )
}

/** Вкладка «Приглашения» раздела «Пользователи»: кого пригласили, повтор и отзыв. */
export function InvitationsPage() {
  const { t } = useTranslation('admin')

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <p className="text-muted-foreground text-sm">{t('invitations.description')}</p>
        <InviteUserDialog />
      </div>
      <InvitationsTable />
    </div>
  )
}
