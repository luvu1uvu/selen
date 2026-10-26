import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorBody, getErrorMessage } from '@/shared/api/errors'
import type { SpaceRole } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
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
import { Label } from '@/shared/ui/label'
import { NativeSelect } from '@/shared/ui/select'
import { useAddSpaceGroup, useGroupDirectory } from '../queries'
import { RoleSelectOptions } from './RoleSelectOptions'

/** Выдать доступ группе: группа из справочника активных, роль и режим «только свои карточки». */
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
  const [role, setRole] = useState<SpaceRole>('commenter')
  const [ownCardsOnly, setOwnCardsOnly] = useState(false)
  const [error, setError] = useState<string>()
  const directory = useGroupDirectory(companyId, open)
  const add = useAddSpaceGroup(spaceKey)
  const options = (directory.data ?? []).filter((group) => !grantedIds.includes(group.id))
  const isSystem = options.find((group) => group.id === groupId)?.system != null

  const reset = () => {
    setGroupId('')
    setRole('commenter')
    setOwnCardsOnly(false)
    setError(undefined)
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!groupId) {
      setError(t('addGroup.groupRequired'))
      return
    }
    try {
      await add.mutateAsync({
        group_id: groupId,
        role,
        own_cards_only: role !== 'admin' && ownCardsOnly,
      })
      toast.success(t('groups.toasts.added'))
      reset()
      setOpen(false)
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      const fieldError = errors?.group_id?.[0] ?? errors?.role?.[0] ?? errors?.own_cards_only?.[0]
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
                if (next?.system && role === 'admin') setRole('commenter')
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
          <FormField
            id="space-group-role"
            label={t('addMember.role')}
            hint={t(`roleHints.${role}`)}
          >
            <NativeSelect
              id="space-group-role"
              value={role}
              onChange={(event) => setRole(event.target.value as SpaceRole)}
            >
              <RoleSelectOptions withoutAdmin={isSystem} />
            </NativeSelect>
          </FormField>
          {role !== 'admin' && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="space-group-own"
                checked={ownCardsOnly}
                onCheckedChange={(checked) => setOwnCardsOnly(checked === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="space-group-own">{t('members.ownCardsOnly')}</Label>
                <p className="text-muted-foreground text-xs">{t('members.ownCardsOnlyHint')}</p>
              </div>
            </div>
          )}
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
