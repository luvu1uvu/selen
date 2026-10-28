import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, ArrowUpDown, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminUrl } from '@/features/admin/company'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Pagination } from '@/shared/components/Pagination'
import { formatDate, formatDateTime } from '@/shared/lib/dates'
import { isMultiCompany, isOwner } from '@/shared/lib/roles'
import type { AdminUser, UserSort, UserStatusFilter } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import {
  useCancelEmailChange,
  useChangeRole,
  useReactivateUser,
  useRemoveGuest,
  useSetUserBlocked,
  useResendInvitation,
  useRevokeInvitation,
  useTerminateSessions,
  useUsers,
} from '../queries'
import { ChangeEmailDialog } from './ChangeEmailDialog'
import { DeactivateUserDialog } from './DeactivateUserDialog'
import { GuestBadge } from './GuestBadge'
import { GuestDialog } from './GuestDialog'
import { UserStatusBadge } from './UserStatusBadge'

type Confirm = { kind: 'revoke' | 'removeGuest' | 'terminate'; user: AdminUser } | null

/** Щелчок по заголовку «Последняя активность»: по имени → сначала недавние → сначала давние → по имени. */
const NEXT_SORT: Record<UserSort, UserSort> = {
  name: '-last_seen',
  '-last_seen': 'last_seen',
  last_seen: 'name',
}
const SORT_HINT: Record<UserSort, 'toNewest' | 'toOldest' | 'toName'> = {
  name: 'toNewest',
  '-last_seen': 'toOldest',
  last_seen: 'toName',
}

export function UsersTable() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const navigate = useNavigate()
  const url = useAdminUrl()
  const [status, setStatus] = useState<UserStatusFilter | ''>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<UserSort>('name')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)
  const [toBlock, setToBlock] = useState<AdminUser | null>(null)
  const [toChangeEmail, setToChangeEmail] = useState<AdminUser | null>(null)
  // Гость окна остаётся, пока окно закрывается (иначе на время анимации заголовок стал бы «Добавить гостя»)
  const [guest, setGuest] = useState<AdminUser | null>(null)
  const [guestOpen, setGuestOpen] = useState(false)

  const usersQuery = useUsers({
    status: status || undefined,
    search: search || undefined,
    sort: sort === 'name' ? undefined : sort,
    page,
  })
  const changeRole = useChangeRole()
  const reactivate = useReactivateUser()
  const resend = useResendInvitation()
  const revoke = useRevokeInvitation()
  const block = useSetUserBlocked()
  const removeGuest = useRemoveGuest()
  const terminate = useTerminateSessions()
  const cancelEmailChange = useCancelEmailChange()

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
    if (confirm.kind === 'removeGuest') {
      const userId = confirm.user.id
      await run(() => removeGuest.mutateAsync(userId), t('guests.removed'))
    } else if (confirm.kind === 'terminate') {
      const userId = confirm.user.id
      await run(() => terminate.mutateAsync(userId), t('users.toasts.sessionsTerminated'))
    } else if (confirm.user.invitation) {
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
            setStatus(event.target.value as UserStatusFilter | '')
            setPage(1)
          }}
          className="sm:w-48"
        >
          <option value="">{t('users.filters.all')}</option>
          <option value="active">{t('users.filters.active')}</option>
          <option value="invited">{t('users.filters.invited')}</option>
          <option value="deactivated">{t('users.filters.deactivated')}</option>
          {/* Гости — только в копии с несколькими компаниями (ADR-0026) */}
          {isMultiCompany(me) && <option value="guest">{t('users.filters.guest')}</option>}
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
            {/* «Последняя активность» (П2c-2) — с сортировкой: щелчок по заголовку меняет порядок */}
            <TableHead
              className="hidden lg:table-cell"
              aria-sort={
                sort === '-last_seen'
                  ? 'descending'
                  : sort === 'last_seen'
                    ? 'ascending'
                    : undefined
              }
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 px-2"
                    onClick={() => {
                      setSort(NEXT_SORT[sort])
                      setPage(1)
                    }}
                  >
                    {t('users.columns.lastSeen')}
                    {sort === '-last_seen' ? (
                      <ArrowDown aria-hidden />
                    ) : sort === 'last_seen' ? (
                      <ArrowUp aria-hidden />
                    ) : (
                      <ArrowUpDown aria-hidden className="text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t(`users.sort.${SORT_HINT[sort]}`)}</TooltipContent>
              </Tooltip>
            </TableHead>
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
            // Вернуть в компанию — если учётную запись не отключил Владелец (её включает только он)
            const canReactivate =
              can.reactivate &&
              user.status === 'deactivated' &&
              !user.blocked &&
              invitation?.state !== 'revoked'
            const canDeactivate = can.deactivate && user.status === 'active'
            const canBlock = can.block && !user.blocked && user.status !== 'invited'
            const canUnblock = can.block && user.blocked
            const canManageGuest = can.manage_guest && user.guest !== null
            // Завершить сеансы — у того, кто может войти; email — у того, кто уже принял приглашение (П2c-2)
            const canTerminate = can.terminate_sessions && user.status === 'active'
            const canChangeEmail = can.change_email && user.status !== 'invited'
            const canCancelEmailChange = can.change_email && user.email_change !== null
            const hasActions =
              canChangeRole ||
              hasPendingInvitation ||
              canResend ||
              canReactivate ||
              canDeactivate ||
              canBlock ||
              canUnblock ||
              canManageGuest ||
              canTerminate ||
              canChangeEmail ||
              canCancelEmailChange

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">
                    <Link
                      to={url(`users/${user.id}`)}
                      className="hover:underline"
                      title={t('users.actions.access')}
                    >
                      {user.name}
                    </Link>{' '}
                    {isMe && <Badge variant="outline">{t('users.badges.you')}</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs md:hidden">{user.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {user.email}
                  {user.email_change && <PendingEmail change={user.email_change} />}
                </TableCell>
                <TableCell>
                  {isOwner(user) ? (
                    <Badge variant="secondary" title={t('users.badges.ownerHint')}>
                      {tc('roles.owner')}
                    </Badge>
                  ) : user.guest ? (
                    <GuestBadge guest={user.guest} />
                  ) : (
                    tc(`roles.${user.role}`)
                  )}
                </TableCell>
                <TableCell>
                  <UserStatusBadge user={user} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {/* До П2c-2 активность не писалась — тогда последний вход */}
                  {formatDateTime(user.last_seen_at ?? user.last_login_at, me?.timezone)}
                </TableCell>
                <TableCell>
                  {isMe || !hasActions ? (
                    // Подсказка — Tooltip по наведению и по фокусу (правило 8); в чужой строке — и почему нет «⋯»
                    // (LATER-85)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" asChild>
                          <Link to={url(`users/${user.id}`)} aria-label={t('users.actions.access')}>
                            <KeyRound />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{t('users.actions.access')}</p>
                        {!isMe && (
                          <p>
                            {user.blocked
                              ? t('users.blockedOnlyOwner')
                              : t('users.actionsUnavailable')}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <ActionsMenu label={t('users.actions.menu', { name: user.name })}>
                      {(dialog) => (
                        <>
                          <DropdownMenuItem onSelect={() => navigate(url(`users/${user.id}`))}>
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
                          {canManageGuest && (
                            <DropdownMenuItem
                              onSelect={dialog(() => {
                                setGuest(user)
                                setGuestOpen(true)
                              })}
                            >
                              {t('guests.edit')}
                            </DropdownMenuItem>
                          )}
                          {canChangeEmail && (
                            <DropdownMenuItem onSelect={dialog(() => setToChangeEmail(user))}>
                              {t('users.actions.changeEmailEllipsis')}
                            </DropdownMenuItem>
                          )}
                          {canCancelEmailChange && (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () => cancelEmailChange.mutateAsync(user.id),
                                  t('users.toasts.emailChangeCancelled'),
                                )
                              }
                            >
                              {t('users.actions.cancelEmailChange')}
                            </DropdownMenuItem>
                          )}
                          {canTerminate && (
                            <DropdownMenuItem
                              onSelect={dialog(() => setConfirm({ kind: 'terminate', user }))}
                            >
                              {t('users.actions.terminateSessionsEllipsis')}
                            </DropdownMenuItem>
                          )}
                          {canUnblock && (
                            <DropdownMenuItem
                              onSelect={() =>
                                run(
                                  () => block.mutateAsync({ userId: user.id, blocked: false }),
                                  t('users.toasts.unblocked'),
                                )
                              }
                            >
                              {t('users.actions.unblock')}
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
                          {(canDeactivate ||
                            hasPendingInvitation ||
                            canBlock ||
                            canManageGuest) && <DropdownMenuSeparator />}
                          {canManageGuest && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={dialog(() => setConfirm({ kind: 'removeGuest', user }))}
                            >
                              {t('guests.removeEllipsis')}
                            </DropdownMenuItem>
                          )}
                          {canDeactivate && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={dialog(() => setToDeactivate(user))}
                            >
                              {t('users.actions.deactivateEllipsis')}
                            </DropdownMenuItem>
                          )}
                          {canBlock && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={dialog(() => setToBlock(user))}
                            >
                              {t('users.actions.blockEllipsis')}
                            </DropdownMenuItem>
                          )}
                          {hasPendingInvitation && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={dialog(() => setConfirm({ kind: 'revoke', user }))}
                            >
                              {t('users.actions.revokeInvitation')}
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </ActionsMenu>
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
        pending={revoke.isPending || removeGuest.isPending || terminate.isPending}
        onConfirm={onConfirm}
        title={
          confirm?.kind === 'removeGuest'
            ? t('guests.removeTitle')
            : confirm?.kind === 'terminate'
              ? t('users.confirm.terminateTitle')
              : t('users.confirm.revokeTitle')
        }
        description={
          confirm?.kind === 'removeGuest'
            ? t('guests.removeText', { name: confirm.user.name })
            : confirm?.kind === 'terminate'
              ? t('users.confirm.terminateText', { name: confirm.user.name })
              : t('users.confirm.revokeText', { email: confirm?.user.email ?? '' })
        }
        confirmLabel={
          confirm?.kind === 'removeGuest'
            ? t('guests.remove')
            : confirm?.kind === 'terminate'
              ? t('users.actions.terminateSessions')
              : t('users.actions.revokeInvitation')
        }
      />
      <DeactivateUserDialog user={toDeactivate} onClose={() => setToDeactivate(null)} />
      <DeactivateUserDialog user={toBlock} account onClose={() => setToBlock(null)} />
      <ChangeEmailDialog user={toChangeEmail} onClose={() => setToChangeEmail(null)} />
      <GuestDialog open={guestOpen} guest={guest} onClose={() => setGuestOpen(false)} />
    </div>
  )
}

/** Новый email ждёт подтверждения (П2c-2): адрес и до какого времени действует ссылка — в подсказке по фокусу. */
function PendingEmail({ change }: { change: NonNullable<AdminUser['email_change']> }) {
  const { t } = useTranslation('admin')
  const { data: me } = useCurrentUser()
  const date = formatDate(change.expires_at, me?.timezone)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="text-muted-foreground block w-fit text-xs">
          {change.expired
            ? t('users.emailChange.pendingExpired', { email: change.email })
            : t('users.emailChange.pending', { email: change.email })}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {change.expired
          ? t('users.emailChange.pendingExpiredHint', { date })
          : t('users.emailChange.pendingHint', {
              date: formatDateTime(change.expires_at, me?.timezone),
            })}
      </TooltipContent>
    </Tooltip>
  )
}
