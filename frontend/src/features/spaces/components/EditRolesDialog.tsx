import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { RolesField } from './RolesField'

export interface EditRolesTarget {
  /** Заголовок окна: «Роли: Иван Петров» или «Роли группы «Разработка»». */
  title: string
  description?: string
  roles: RoleKey[]
  /** Гость и «Все сотрудники» — без «Администратора». */
  withoutManaging?: boolean
}

/**
 * Изменить роли человека или группы на папке или пространстве (П2d-1): набор ролей чипами целиком. Ошибка сервера
 * (например, «пространство останется без управляющего доступом») — под полем, окно остаётся открытым.
 */
export function EditRolesDialog({
  target,
  onClose,
  onSave,
}: {
  target: EditRolesTarget | null
  onClose: () => void
  /** Сохранить; бросает ошибку запроса — окно покажет её. */
  onSave: (roles: RoleKey[]) => Promise<unknown>
}) {
  // Новая цель — новая форма с её ролями
  return target ? (
    <EditRolesForm key={target.title} target={target} onClose={onClose} onSave={onSave} />
  ) : null
}

function EditRolesForm({
  target,
  onClose,
  onSave,
}: {
  target: EditRolesTarget
  onClose: () => void
  onSave: (roles: RoleKey[]) => Promise<unknown>
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const [roles, setRoles] = useState<RoleKey[]>(target.roles)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (roles.length === 0) {
      setError(t('rolesField.required'))
      return
    }
    setPending(true)
    try {
      await onSave(roles)
      onClose()
    } catch (err) {
      const errors = getErrorBody(err)?.errors
      setError(
        errors?.roles?.[0] ?? errors?.user_id?.[0] ?? getErrorMessage(err, tc('errors.generic')),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{target.title}</DialogTitle>
          {target.description && <DialogDescription>{target.description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <FormField id="edit-roles" label={t('rolesField.label')} error={error}>
            <RolesField
              id="edit-roles"
              value={roles}
              onChange={(next) => {
                setRoles(next)
                setError(undefined)
              }}
              withoutManaging={target.withoutManaging}
              invalid={!!error}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
