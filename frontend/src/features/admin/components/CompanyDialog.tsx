import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { Company } from '@/shared/types/api'
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
import { Input } from '@/shared/ui/input'
import { useSaveCompany } from '../queries'

/** Новая компания (company = 'new') или новое название. null — диалог закрыт. */
export function CompanyDialog({
  company,
  onClose,
}: {
  company: Company | 'new' | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const save = useSaveCompany()
  const editing = company !== null && company !== 'new' ? company : null

  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1, t('companies.form.nameRequired')).max(100) }),
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
    values: { name: editing?.name ?? '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: editing?.id, name: values.name })
      toast.success(
        editing
          ? t('companies.toasts.renamed')
          : t('companies.toasts.created', { name: saved.name }),
      )
      onClose()
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Dialog open={company !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>
            {editing ? t('companies.form.renameTitle') : t('companies.form.createTitle')}
          </DialogTitle>
          {!editing && <DialogDescription>{t('companies.form.createHint')}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            id="company-name"
            label={t('companies.form.name')}
            error={errors.name?.message}
          >
            <Input id="company-name" aria-invalid={!!errors.name} {...register('name')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {editing ? tc('actions.save') : t('companies.form.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
