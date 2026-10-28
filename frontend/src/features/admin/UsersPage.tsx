import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { isOwner } from '@/shared/lib/roles'
import { Button } from '@/shared/ui/button'
import { GuestDialog } from './components/GuestDialog'
import { InvitationsTable } from './components/InvitationsTable'
import { InviteUserDialog } from './components/InviteUserDialog'
import { TransferOwnershipDialog } from './components/TransferOwnershipDialog'
import { UsersTable } from './components/UsersTable'
import { hasCompanyPermission, useAdminCompany } from './company'

/**
 * Вкладка «Пользователи» раздела «Пользователи»: люди и гости компании, приглашение, гость (П2c), передача владения
 * (Владелец).
 */
export function UsersPage() {
  const { t } = useTranslation('admin')
  const { data: me } = useCurrentUser()
  const company = useAdminCompany()
  const [addingGuest, setAddingGuest] = useState(false)

  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <p className="text-muted-foreground text-sm">{t('users.description')}</p>
        <div className="flex flex-wrap gap-2">
          {isOwner(me) && <TransferOwnershipDialog />}
          {hasCompanyPermission(company, 'company.manage_users') && (
            <Button variant="outline" onClick={() => setAddingGuest(true)}>
              {t('guests.addButton')}
            </Button>
          )}
          {hasCompanyPermission(company, 'company.invite_users') && <InviteUserDialog />}
        </div>
      </div>
      <UsersTable />
      <GuestDialog open={addingGuest} guest={null} onClose={() => setAddingGuest(false)} />
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
