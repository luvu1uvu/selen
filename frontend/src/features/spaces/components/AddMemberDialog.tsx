import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { DirectoryUser, RoleKey } from '@/shared/types/api'
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
import { useAddMember } from '../queries'
import { RolesField } from './RolesField'
import { UserPicker } from './UserPicker'

/**
 * Добавление участника лично — с одной или несколькими ролями чипами (П2d-1). Без presetUser — кнопка «Добавить
 * участника» и поиск сотрудника; с presetUser — управляемый диалог «Добавить лично» для человека, у которого доступ
 * только через группы или папки.
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
  const [roles, setRoles] = useState<RoleKey[]>(['editor'])
  const [error, setError] = useState<string>()
  const [rolesError, setRolesError] = useState<string>()
  const addMember = useAddMember(spaceKey)

  const reset = () => {
    setUser(null)
    setRoles(['editor'])
    setError(undefined)
    setRolesError(undefined)
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) setError(t('addMember.userRequired'))
    if (roles.length === 0) setRolesError(t('rolesField.required'))
    if (!user || roles.length === 0) return
    try {
      await addMember.mutateAsync({ user_id: user.id, roles })
      toast.success(t('members.added'))
      reset()
      setOpen(false)
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      if (errors?.user_id?.[0]) setError(errors.user_id[0])
      else if (errors?.roles?.[0]) setRolesError(errors.roles[0])
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
          <FormField id="member-roles" label={t('rolesField.label')} error={rolesError}>
            <RolesField
              id="member-roles"
              value={roles}
              onChange={(next) => {
                setRoles(next)
                setRolesError(undefined)
              }}
              invalid={!!rolesError}
            />
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
