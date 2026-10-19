import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { LabelBadge } from '@/shared/components/LabelBadge'
import { PALETTE } from '@/shared/lib/palette'
import { cn } from '@/shared/lib/utils'
import type { Label } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { useSaveLabel } from '../queries'

/**
 * Создание (label = 'new') и изменение метки. spaceKey = null — общая метка компании. null — закрыт.
 */
export function LabelDialog({
  spaceKey,
  label,
  onClose,
}: {
  spaceKey: string | null
  label: Label | 'new' | null
  onClose: () => void
}) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const save = useSaveLabel(spaceKey)
  const editing = label !== null && label !== 'new' ? label : null

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('labels.form.nameRequired')).max(50),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, t('labels.form.colorInvalid')),
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
      toast.success(t('labels.toasts.saved'))
      onClose()
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={label !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('labels.form.editTitle') : t('labels.form.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="label-name" label={t('labels.form.name')} error={errors.name?.message}>
            <Input id="label-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <FormField id="label-color" label={t('labels.form.color')} error={errors.color?.message}>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={t('labels.form.pickColor', { color: preset })}
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
                id="label-color"
                className="w-28 font-mono"
                aria-invalid={!!errors.color}
                {...register('color')}
              />
            </div>
          </FormField>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">{t('labels.form.preview')}</span>
            <LabelBadge name={name || '—'} color={color} />
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
