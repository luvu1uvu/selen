import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { Group } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { useSaveGroup } from '../queries'

/** Создание (group = 'new') и изменение группы: название и описание. null — диалог закрыт. */
export function GroupDialog({
  group,
  onClose,
  onCreated,
}: {
  group: Group | 'new' | null
  onClose: () => void
  onCreated?: (group: Group) => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const save = useSaveGroup()
  const editing = group !== null && group !== 'new' ? group : null

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('groups.form.nameRequired')).max(100),
        description: z.string().trim().max(1000),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: editing?.name ?? '', description: editing?.description ?? '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        id: editing?.id,
        name: values.name,
        description: values.description || null,
      })
      toast.success(t('groups.toasts.saved'))
      onClose()
      if (!editing) onCreated?.(saved)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('groups.form.editTitle') : t('groups.form.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="group-name" label={t('groups.form.name')} error={errors.name?.message}>
            <Input id="group-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField
            id="group-description"
            label={t('groups.form.description')}
            error={errors.description?.message}
          >
            <Textarea id="group-description" rows={3} {...register('description')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
