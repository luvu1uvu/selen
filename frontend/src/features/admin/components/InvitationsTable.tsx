import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import type { Invitation } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useInvitations, useResendInvitation, useRevokeInvitation } from '../queries'
import { InvitationStateBadge } from './InvitationStateBadge'

export function InvitationsTable() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [page, setPage] = useState(1)
  const [toRevoke, setToRevoke] = useState<Invitation | null>(null)
  const invitationsQuery = useInvitations(page)
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()

  const onResend = async (invitation: Invitation) => {
    try {
      await resend.mutateAsync(invitation.id)
      toast.success(t('users.toasts.invitationResent', { email: invitation.email }))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const onRevoke = async () => {
    if (!toRevoke) return
    try {
      await revoke.mutateAsync(toRevoke.id)
      toast.success(t('users.toasts.invitationRevoked'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
    setToRevoke(null)
  }

  return (
    <div className="grid gap-4">
      {invitationsQuery.isError && (
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('invitations.columns.name')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('invitations.columns.email')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('invitations.columns.role')}</TableHead>
            <TableHead>{t('invitations.columns.state')}</TableHead>
            <TableHead className="hidden lg:table-cell">
              {t('invitations.columns.expiresAt')}
            </TableHead>
            <TableHead className="hidden lg:table-cell">
              {t('invitations.columns.invitedBy')}
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitationsQuery.data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                {tc('states.empty')}
              </TableCell>
            </TableRow>
          )}
          {invitationsQuery.data?.data.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell>
                <div className="font-medium">{invitation.name}</div>
                <div className="text-muted-foreground text-xs md:hidden">{invitation.email}</div>
              </TableCell>
              <TableCell className="hidden md:table-cell">{invitation.email}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {tc(`roles.${invitation.role}`)}
              </TableCell>
              <TableCell>
                <InvitationStateBadge state={invitation.state} />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {formatDateTime(invitation.expires_at, me?.timezone)}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {invitation.invited_by?.name ?? '—'}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  {invitation.can_resend && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() => onResend(invitation)}
                    >
                      {t('invitations.actions.resend')}
                    </Button>
                  )}
                  {invitation.can_revoke && (
                    <Button size="sm" variant="ghost" onClick={() => setToRevoke(invitation)}>
                      {t('invitations.actions.revoke')}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {invitationsQuery.data && (
        <Pagination meta={invitationsQuery.data.meta} onPageChange={setPage} />
      )}
      <ConfirmDialog
        open={toRevoke !== null}
        onOpenChange={(open) => !open && setToRevoke(null)}
        pending={revoke.isPending}
        onConfirm={onRevoke}
        title={t('users.confirm.revokeTitle')}
        description={t('users.confirm.revokeText', { email: toRevoke?.email ?? '' })}
        confirmLabel={t('invitations.actions.revoke')}
      />
    </div>
  )
}
