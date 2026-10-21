import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { Space } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { useUpdateSpace } from '../queries'

/** «Изменить» на панели пространства: название и описание. Открывает панель — кнопкой или пунктом меню «⋯». */
export function EditSpaceDialog({
  space,
  open,
  onOpenChange: setOpen,
}: {
  space: Space
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const updateSpace = useUpdateSpace(space.key)

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('edit.nameRequired')).max(100),
        description: z.string().max(2000),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const defaults = { name: space.name, description: space.description ?? '' }
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: defaults })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateSpace.mutateAsync({
        name: values.name,
        description: values.description.trim() || null,
      })
      toast.success(t('edit.saved'))
      setOpen(false)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset(defaults)
      }}
    >
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="space-name" label={t('edit.name')} error={errors.name?.message}>
            <Input id="space-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField
            id="space-description"
            label={t('edit.description')}
            error={errors.description?.message}
          >
            <Textarea id="space-description" rows={3} {...register('description')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
