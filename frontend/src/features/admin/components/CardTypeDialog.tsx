import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { CardTypeLabel } from '@/shared/components/CardTypeLabel'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { PALETTE } from '@/shared/lib/palette'
import { cn } from '@/shared/lib/utils'
import type { CardType } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { useSaveCardType } from '../queries'

/**
 * Создание (type = 'new') и редактирование типа карточки. null — диалог закрыт.
 */
export function CardTypeDialog({
  type,
  onClose,
}: {
  type: CardType | 'new' | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const save = useSaveCardType()
  const editing = type !== null && type !== 'new' ? type : null

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('cardTypes.form.nameRequired')).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, t('cardTypes.form.colorInvalid')),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { name: editing?.name ?? '', color: editing?.color ?? PALETTE[0] },
  })
  const color = useWatch({ control, name: 'color' })
  const name = useWatch({ control, name: 'name' })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: editing?.id, ...values })
      toast.success(t('cardTypes.toasts.saved'))
      onClose()
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('cardTypes.form.editTitle') : t('cardTypes.form.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            id="card-type-name"
            label={t('cardTypes.form.name')}
            error={errors.name?.message}
          >
            <Input id="card-type-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField
            id="card-type-color"
            label={t('cardTypes.form.color')}
            error={errors.color?.message}
          >
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={t('cardTypes.form.pickColor', { color: preset })}
                  aria-pressed={color.toLowerCase() === preset}
                  className={cn(
                    'size-7 rounded-full border-2 border-transparent',
                    color.toLowerCase() === preset && 'border-foreground',
                  )}
                  style={{ backgroundColor: preset }}
                  onClick={() => setValue('color', preset, { shouldValidate: true })}
                />
              ))}
              <Input
                id="card-type-color"
                className="w-28 font-mono"
                aria-invalid={!!errors.color}
                {...register('color')}
              />
            </div>
          </FormField>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">{t('cardTypes.form.preview')}</span>
            <CardTypeLabel name={name || '—'} color={color} />
          </div>
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
