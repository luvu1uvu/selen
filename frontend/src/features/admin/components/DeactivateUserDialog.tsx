import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminCompanyId } from '@/features/admin/company'
import { useCurrentUser } from '@/features/auth/queries'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { getErrorMessage } from '@/shared/api/errors'
import { companyModeContext } from '@/shared/lib/roles'
import type { DirectoryUser, User } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { useDeactivateUser, useDeactivationImpact, useSetUserBlocked } from '../queries'
import { AssignSpaceRoleDialog } from './AssignSpaceRoleDialog'

/**
 * Деактивация в компании (П2c) и отключение учётной записи Владельцем (account). Никогда не блокируется (решение PM
 * этапа 3), но заранее предупреждает о пространствах, где человек — последний личный администратор (при отключении —
 * во всех его компаниях), и даёт назначить замену. При деактивации — по желанию передать доступ преемнику (аудит
 * Kaiten «Заменить», решение PM 28.10, п. 5). В копии с одной компанией (ADR-0026) тексты — без других компаний.
 */
export function DeactivateUserDialog({
  user,
  account = false,
  onClose,
}: {
  user: (Pick<User, 'id' | 'name'> & { permissions?: { transfer_access: boolean } }) | null
  /** Отключить учётную запись во всех компаниях — только Владелец. */
  account?: boolean
  onClose: () => void
}) {
  const company = useAdminCompanyId()
  const { data: me } = useCurrentUser()
  const context = companyModeContext(me)
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const impact = useDeactivationImpact(user?.id ?? null, account)
  const deactivate = useDeactivateUser()
  const block = useSetUserBlocked()
  const [replaceIn, setReplaceIn] = useState<{ id: string; name: string } | null>(null)
  const [successor, setSuccessor] = useState<DirectoryUser | null>(null)
  const spaces = impact.data?.last_admin_spaces ?? []

  const close = () => {
    setSuccessor(null)
    onClose()
  }

  const confirm = async () => {
    if (!user) return
    try {
      if (account) {
        await block.mutateAsync({ userId: user.id, blocked: true })
        toast.success(t('users.toasts.blocked'))
      } else {
        await deactivate.mutateAsync({ userId: user.id, successorId: successor?.id })
        toast.success(
          successor
            ? t('users.toasts.deactivatedWithTransfer', { name: successor.name })
            : t('users.toasts.deactivated'),
        )
      }
      close()
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <>
      <Dialog open={user !== null && replaceIn === null} onOpenChange={(open) => !open && close()}>
        <DialogContent closeLabel={tc('actions.close')}>
          <DialogHeader>
            <DialogTitle>
              {account
                ? t('users.confirm.blockTitle')
                : t('users.confirm.deactivateTitle', { context })}
            </DialogTitle>
            <DialogDescription>
              {account
                ? t('users.confirm.blockText', { name: user?.name ?? '', context })
                : t('users.confirm.deactivateText', { name: user?.name ?? '', context })}
            </DialogDescription>
          </DialogHeader>
          {!account && user?.permissions?.transfer_access && (
            <FormField
              id="deactivate-successor"
              label={t('users.transferAccess.label')}
              hint={t('users.transferAccess.hint')}
            >
              <UserPicker
                id="deactivate-successor"
                companyId={company}
                value={successor}
                onChange={setSuccessor}
                excludeIds={user ? [user.id] : []}
                onlyActive
                homes
              />
            </FormField>
          )}
          {spaces.length > 0 && (
            <Alert variant="warning" className="grid gap-2">
              <div className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4 shrink-0" />
                {t('users.lastAdmin.title', { count: spaces.length })}
              </div>
              <div>
                <p>
                  {account
                    ? t('users.lastAdmin.accountText', { context })
                    : t('users.lastAdmin.text')}
                </p>
                <ul className="mt-2 grid gap-1">
                  {spaces.map((space) => (
                    <li
                      key={space.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {t('users.lastAdmin.space', { name: space.name, key: space.key })}
                      </span>
                      {!account && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReplaceIn({ id: space.id, name: space.name })}
                        >
                          {t('users.lastAdmin.assign')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deactivate.isPending || block.isPending || impact.isPending}
              onClick={confirm}
            >
              {account ? t('users.actions.block') : t('users.actions.deactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssignSpaceRoleDialog space={replaceIn} onClose={() => setReplaceIn(null)} />
    </>
  )
}
