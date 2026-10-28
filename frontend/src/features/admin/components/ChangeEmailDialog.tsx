import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { emailSchema } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import type { AdminUser } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
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
import { useRequestEmailChange } from '../queries'

/**
 * «Изменить email…» (П2c-2, LATER-9; решение PM 28.10): email меняется, когда по ссылке из письма на новый адрес
 * перейдут; на прежний адрес сразу уходит уведомление. До подтверждения строка человека показывает новый адрес.
 */
export function ChangeEmailDialog({
  user,
  onClose,
}: {
  user: Pick<AdminUser, 'id' | 'name' | 'email'> | null
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const request = useRequestEmailChange()

  const schema = useMemo(() => z.object({ email: emailSchema(ta) }), [ta])
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const close = () => {
    reset()
    onClose()
  }

  const onSubmit = handleSubmit(async ({ email }) => {
    if (!user) return
    try {
      await request.mutateAsync({ userId: user.id, email })
      toast.success(t('users.toasts.emailChangeRequested', { email: email.trim().toLowerCase() }))
      close()
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        setError('root', { message: getErrorMessage(error, tc('errors.generic')) })
      }
    }
  })

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('users.emailChange.title')}</DialogTitle>
          <DialogDescription>{t('users.emailChange.description')}</DialogDescription>
        </DialogHeader>
        <form id="change-email-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
          {errors.root?.message && <Alert variant="destructive">{errors.root.message}</Alert>}
          <p className="text-muted-foreground text-sm">
            {t('users.emailChange.current', { email: user?.email ?? '' })}
          </p>
          <FormField
            id="change-email"
            label={t('users.emailChange.field')}
            error={errors.email?.message}
          >
            <Input
              id="change-email"
              type="email"
              autoComplete="off"
              autoFocus
              aria-invalid={!!errors.email}
              {...register('email')}
            />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" form="change-email-form" disabled={isSubmitting}>
            {t('users.emailChange.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
