import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { isOwner } from '@/shared/lib/roles'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { InvitationsTable } from './components/InvitationsTable'
import { InviteUserDialog } from './components/InviteUserDialog'
import { TransferOwnershipDialog } from './components/TransferOwnershipDialog'
import { UsersTable } from './components/UsersTable'

export function UsersPage() {
  const { t } = useTranslation('admin')
  const { data: me } = useCurrentUser()

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('users.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('users.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner(me) && <TransferOwnershipDialog />}
          <InviteUserDialog />
        </div>
      </div>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('users.tabs.users')}</TabsTrigger>
          <TabsTrigger value="invitations">{t('users.tabs.invitations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTable />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
