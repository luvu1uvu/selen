import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { DirectoryUser, SpaceRole } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { NativeSelect } from '@/shared/ui/select'
import { useAddMember } from '../queries'
import { RoleSelectOptions } from './RoleSelectOptions'
import { UserPicker } from './UserPicker'

/**
 * Добавление участника лично. Без presetUser — кнопка «Добавить участника» и поиск сотрудника;
 * с presetUser — управляемый диалог «Добавить лично» для человека, у которого доступ только через группы.
 */
export function AddMemberDialog({
  spaceKey,
  companyId,
  memberIds,
  presetUser = null,
  onClose,
}: {
  spaceKey: string
  /** Компания пространства: предлагаются только её люди (ADR-0024). */
  companyId: string
  memberIds: string[]
  presetUser?: DirectoryUser | null
  onClose?: () => void
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const controlled = onClose !== undefined
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlled ? presetUser !== null : ownOpen
  const setOpen = (next: boolean) => (controlled ? !next && onClose() : setOwnOpen(next))
  const [picked, setUser] = useState<DirectoryUser | null>(null)
  const user = presetUser ?? picked
  const [role, setRole] = useState<SpaceRole>('editor')
  const [error, setError] = useState<string>()
  const addMember = useAddMember(spaceKey)

  const reset = () => {
    setUser(null)
    setRole('editor')
    setError(undefined)
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) {
      setError(t('addMember.userRequired'))
      return
    }
    try {
      await addMember.mutateAsync({ user_id: user.id, role })
      toast.success(t('members.added'))
      reset()
      setOpen(false)
    } catch (err) {
      const fieldError = getErrorBody(err)?.errors?.user_id?.[0]
      if (fieldError) setError(fieldError)
      else toast.error(getErrorMessage(err, tc('errors.generic')))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      {!controlled && (
        <DialogTrigger asChild>
          <Button>{t('members.add')}</Button>
        </DialogTrigger>
      )}
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('addMember.title')}</DialogTitle>
          <DialogDescription>
            {t(presetUser ? 'addMember.presetDescription' : 'addMember.description')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="member-user" label={t('addMember.user')} error={error}>
            {presetUser ? (
              <div id="member-user" className="rounded-md border px-3 py-2 text-sm">
                <div className="font-medium">{presetUser.name}</div>
                <div className="text-muted-foreground text-xs">{presetUser.email}</div>
              </div>
            ) : (
              <UserPicker
                id="member-user"
                companyId={companyId}
                value={user}
                onChange={(next) => {
                  setUser(next)
                  setError(undefined)
                }}
                excludeIds={memberIds}
                invalid={!!error}
              />
            )}
          </FormField>
          <FormField id="member-role" label={t('addMember.role')} hint={t(`roleHints.${role}`)}>
            <NativeSelect
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value as SpaceRole)}
            >
              <RoleSelectOptions />
            </NativeSelect>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={addMember.isPending}>
              {t('addMember.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
