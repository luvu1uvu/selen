import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { RoleSelectOptions } from '@/features/spaces/components/RoleSelectOptions'
import { UserPicker } from '@/features/spaces/components/UserPicker'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { AdminSpace, DirectoryUser, SpaceRole } from '@/shared/types/api'
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
import { NativeSelect } from '@/shared/ui/select'
import { useAssignSpaceRole } from '../queries'

/** Назначение роли в пространстве системным администратором — себе или другому сотруднику. */
export function AssignSpaceRoleDialog({
  space,
  onClose,
}: {
  space: Pick<AdminSpace, 'id' | 'name'> | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: ts } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [user, setUser] = useState<DirectoryUser | null>(null)
  const [role, setRole] = useState<SpaceRole>('admin')
  const [error, setError] = useState<string>()
  const assign = useAssignSpaceRole()
  // Пока диалог закрывается (анимация), показываем прежнее название, а не пустое
  const [shown, setShown] = useState<Pick<AdminSpace, 'id' | 'name'> | null>(space)
  if (space !== null && space !== shown) setShown(space)

  const close = () => {
    setUser(null)
    setRole('admin')
    setError(undefined)
    onClose()
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!space) return
    if (!user) {
      setError(t('spaces.assign.userRequired'))
      return
    }
    try {
      await assign.mutateAsync({ spaceId: space.id, userId: user.id, role })
      toast.success(t('spaces.toasts.assigned'))
      close()
    } catch (err) {
      const body = getErrorBody(err)
      const message = body?.errors?.role?.[0] ?? body?.errors?.user_id?.[0]
      if (message) setError(message)
      else toast.error(getErrorMessage(err, tc('errors.generic')))
    }
  }

  return (
    <Dialog open={space !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('spaces.assign.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('spaces.assign.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="assign-user" label={t('spaces.assign.user')} error={error}>
            <div className="grid gap-2">
              <UserPicker
                id="assign-user"
                value={user}
                invalid={!!error}
                onChange={(next) => {
                  setUser(next)
                  setError(undefined)
                }}
              />
              {!user && me && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() =>
                    setUser({ id: me.id, name: me.name, email: me.email, status: me.status })
                  }
                >
                  {t('spaces.assign.me')}
                </Button>
              )}
            </div>
          </FormField>
          <FormField
            id="assign-role"
            label={t('spaces.assign.role')}
            hint={ts(`roleHints.${role}`)}
          >
            <NativeSelect
              id="assign-role"
              value={role}
              onChange={(event) => setRole(event.target.value as SpaceRole)}
            >
              <RoleSelectOptions />
            </NativeSelect>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={assign.isPending}>
              {t('spaces.assign.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
