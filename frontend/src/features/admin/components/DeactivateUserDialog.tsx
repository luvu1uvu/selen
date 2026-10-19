import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { User } from '@/shared/types/api'
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
import { useDeactivateUser, useDeactivationImpact } from '../queries'
import { AssignSpaceRoleDialog } from './AssignSpaceRoleDialog'

/**
 * Деактивация никогда не блокируется (решение PM этапа 3), но заранее предупреждает о пространствах,
 * где человек — последний личный администратор, и даёт назначить замену прямо здесь (необязательно).
 */
export function DeactivateUserDialog({
  user,
  onClose,
}: {
  user: User | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const impact = useDeactivationImpact(user?.id ?? null)
  const deactivate = useDeactivateUser()
  const [replaceIn, setReplaceIn] = useState<{ id: string; name: string } | null>(null)
  const spaces = impact.data?.last_admin_spaces ?? []

  const confirm = async () => {
    if (!user) return
    try {
      await deactivate.mutateAsync(user.id)
      toast.success(t('users.toasts.deactivated'))
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <>
      <Dialog
        open={user !== null && replaceIn === null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent closeLabel={tc('actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('users.confirm.deactivateTitle')}</DialogTitle>
            <DialogDescription>
              {t('users.confirm.deactivateText', { name: user?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          {spaces.length > 0 && (
            <Alert variant="warning" className="grid gap-2">
              <div className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4 shrink-0" />
                {t('users.lastAdmin.title', { count: spaces.length })}
              </div>
              <div>
                <p>{t('users.lastAdmin.text')}</p>
                <ul className="mt-2 grid gap-1">
                  {spaces.map((space) => (
                    <li
                      key={space.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {t('users.lastAdmin.space', { name: space.name, key: space.key })}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReplaceIn({ id: space.id, name: space.name })}
                      >
                        {t('users.lastAdmin.assign')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deactivate.isPending || impact.isPending}
              onClick={confirm}
            >
              {t('users.actions.deactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AssignSpaceRoleDialog space={replaceIn} onClose={() => setReplaceIn(null)} />
    </>
  )
}
