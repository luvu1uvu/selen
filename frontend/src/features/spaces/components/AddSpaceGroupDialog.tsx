import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { RoleKey } from '@/shared/types/api'
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
import { useAddSpaceGroup, useGroupDirectory } from '../queries'
import { MANAGING_ROLES } from '../roles'
import { RolesField } from './RolesField'

/** Выдать доступ группе: группа из справочника активных и роли чипами (П2d-1: можно несколько). */
export function AddSpaceGroupDialog({
  spaceKey,
  companyId,
  grantedIds,
}: {
  spaceKey: string
  /** Компания пространства: предлагаются только её группы (ADR-0024). */
  companyId: string
  grantedIds: string[]
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const [open, setOpen] = useState(false)
  const [groupId, setGroupId] = useState('')
  const [roles, setRoles] = useState<RoleKey[]>(['commenter'])
  const [error, setError] = useState<string>()
  const [rolesError, setRolesError] = useState<string>()
  const directory = useGroupDirectory(companyId, open)
  const add = useAddSpaceGroup(spaceKey)
  const options = (directory.data ?? []).filter((group) => !grantedIds.includes(group.id))
  const isSystem = options.find((group) => group.id === groupId)?.system != null

  const reset = () => {
    setGroupId('')
    setRoles(['commenter'])
    setError(undefined)
    setRolesError(undefined)
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!groupId) setError(t('addGroup.groupRequired'))
    if (roles.length === 0) setRolesError(t('rolesField.required'))
    if (!groupId || roles.length === 0) return
    try {
      await add.mutateAsync({ group_id: groupId, roles })
      toast.success(t('groups.toasts.added'))
      reset()
      setOpen(false)
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      if (errors?.group_id?.[0]) setError(errors.group_id[0])
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
      <DialogTrigger asChild>
        <Button>{t('groups.add')}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('addGroup.title')}</DialogTitle>
          <DialogDescription>{t('addGroup.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="space-group" label={t('addGroup.group')} error={error}>
            <NativeSelect
              id="space-group"
              value={groupId}
              aria-invalid={!!error}
              onChange={(event) => {
                setGroupId(event.target.value)
                setError(undefined)
                // Встроенной группе роль администратора не выдаётся
                const next = options.find((group) => group.id === event.target.value)
                if (next?.system)
                  setRoles((current) => current.filter((r) => !MANAGING_ROLES.includes(r)))
              }}
            >
              <option value="">{t('addGroup.choose')}</option>
              {options.map((group) => (
                <option key={group.id} value={group.id}>
                  {t('addGroup.option', { name: group.name, count: group.members_count })}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="space-group-roles" label={t('rolesField.label')} error={rolesError}>
            <RolesField
              id="space-group-roles"
              value={roles}
              onChange={(next) => {
                setRoles(next)
                setRolesError(undefined)
              }}
              withoutManaging={isSystem}
              invalid={!!rolesError}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {t('addGroup.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
