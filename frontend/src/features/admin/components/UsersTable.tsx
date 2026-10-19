import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { KeyRound, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import { isOwner } from '@/shared/lib/roles'
import type { AdminUser, UserStatus } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import {
  useChangeRole,
  useReactivateUser,
  useResendInvitation,
  useRevokeInvitation,
  useUsers,
} from '../queries'
import { DeactivateUserDialog } from './DeactivateUserDialog'
import { UserStatusBadge } from './UserStatusBadge'

type Confirm = { kind: 'revoke'; user: AdminUser } | null

export function UsersTable() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const navigate = useNavigate()
  const [status, setStatus] = useState<UserStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)

  const usersQuery = useUsers({ status: status || undefined, search: search || undefined, page })
  const changeRole = useChangeRole()
  const reactivate = useReactivateUser()
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action()
      toast.success(successMessage)
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const onConfirm = async () => {
    if (!confirm) return
    if (confirm.user.invitation) {
      const invitationId = confirm.user.invitation.id
      await run(() => revoke.mutateAsync(invitationId), t('users.toasts.invitationRevoked'))
    }
    setConfirm(null)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t('users.searchPlaceholder')}
          aria-label={t('users.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
          className="sm:max-w-xs"
        />
        <NativeSelect
          aria-label={t('users.columns.status')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as UserStatus | '')
            setPage(1)
          }}
          className="sm:w-48"
        >
          <option value="">{t('users.filters.all')}</option>
          <option value="active">{t('users.filters.active')}</option>
          <option value="invited">{t('users.filters.invited')}</option>
          <option value="deactivated">{t('users.filters.deactivated')}</option>
        </NativeSelect>
      </div>

      {usersQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('users.columns.name')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('users.columns.email')}</TableHead>
            <TableHead>{t('users.columns.role')}</TableHead>
            <TableHead>{t('users.columns.status')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('users.columns.lastLogin')}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t('users.columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usersQuery.data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                {tc('states.empty')}
              </TableCell>
            </TableRow>
          )}
          {usersQuery.data?.data.map((user) => {
            const isMe = user.id === me?.id
            const invitation = user.invitation
            // Пункты меню — по правам с сервера (ADR-0017): администраторами и их приглашениями управляет
            // только Владелец, Владельцем — никто. Нет пунктов — нет меню, только ссылка на доступ.
            const can = user.permissions
            const canChangeRole = can.update_role && !isOwner(user)
            const hasPendingInvitation =
              can.manage_invitation &&
              user.status === 'invited' &&
              (invitation?.state === 'pending' || invitation?.state === 'expired')
            const canResend =
              can.manage_invitation &&
              !!invitation &&
              (user.status === 'invited' || invitation.state === 'revoked')
            const canReactivate =
              can.reactivate && user.status === 'deactivated' && invitation?.state !== 'revoked'
            const canDeactivate = can.deactivate && user.status === 'active'
            const hasActions =
              canChangeRole || hasPendingInvitation || canResend || canReactivate || canDeactivate

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">
                    <Link
                      to={`/admin/users/${user.id}`}
                      className="hover:underline"
                      title={t('users.actions.access')}
                    >
                      {user.name}
                    </Link>{' '}
                    {isMe && <Badge variant="outline">{t('users.badges.you')}</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs md:hidden">{user.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                <TableCell>
                  {isOwner(user) ? (
                    <Badge variant="secondary" title={t('users.badges.ownerHint')}>
                      {tc('roles.owner')}
                    </Badge>
                  ) : (
                    tc(`roles.${user.role}`)
                  )}
                </TableCell>
                <TableCell>
                  <UserStatusBadge user={user} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {formatDateTime(user.last_login_at, me?.timezone)}
                </TableCell>
                <TableCell>
                  {isMe || !hasActions ? (
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        to={`/admin/users/${user.id}`}
                        aria-label={t('users.actions.access')}
                        title={isMe ? undefined : t('users.actionsUnavailable')}
                      >
                        <KeyRound />
                      </Link>
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('users.actions.menu')}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => navigate(`/admin/users/${user.id}`)}>
                          {t('users.actions.access')}
                        </DropdownMenuItem>
                        {canChangeRole && (
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                () =>
                                  changeRole.mutateAsync({
                                    userId: user.id,
                                    // Только участник ↔ администратор: роль Владельца — передачей владения
                                    role: user.role === 'admin' ? 'member' : 'admin',
                                  }),
                                t('users.toasts.roleChanged'),
                              )
                            }
                          >
                            {user.role === 'admin'
                              ? t('users.actions.makeMember')
                              : t('users.actions.makeAdmin')}
                          </DropdownMenuItem>
                        )}
                        {canResend && invitation && (
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                () => resend.mutateAsync(invitation.id),
                                t('users.toasts.invitationResent', { email: user.email }),
                              )
                            }
                          >
                            {t('users.actions.resendInvitation')}
                          </DropdownMenuItem>
                        )}
                        {canReactivate && (
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                () => reactivate.mutateAsync(user.id),
                                t('users.toasts.reactivated'),
                              )
                            }
                          >
                            {t('users.actions.reactivate')}
                          </DropdownMenuItem>
                        )}
                        {(canDeactivate || hasPendingInvitation) && <DropdownMenuSeparator />}
                        {canDeactivate && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setToDeactivate(user)}
                          >
                            {t('users.actions.deactivate')}
                          </DropdownMenuItem>
                        )}
                        {hasPendingInvitation && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setConfirm({ kind: 'revoke', user })}
                          >
                            {t('users.actions.revokeInvitation')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {usersQuery.data && <Pagination meta={usersQuery.data.meta} onPageChange={setPage} />}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        pending={revoke.isPending}
        onConfirm={onConfirm}
        title={t('users.confirm.revokeTitle')}
        description={t('users.confirm.revokeText', { email: confirm?.user.email ?? '' })}
        confirmLabel={t('users.actions.revokeInvitation')}
      />
      <DeactivateUserDialog user={toDeactivate} onClose={() => setToDeactivate(null)} />
    </div>
  )
}
