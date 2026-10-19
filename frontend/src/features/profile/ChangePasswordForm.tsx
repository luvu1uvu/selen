import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@/features/auth/schemas'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { changePassword } from './api'

export function ChangePasswordForm() {
  const { t } = useTranslation('profile')
  const { t: ta } = useTranslation('auth')
  const { t: tc } = useTranslation()

  const schema = useMemo(
    () =>
      z
        .object({ current_password: z.string().min(1, t('password.currentRequired')) })
        .and(newPasswordSchema(ta)),
    [t, ta],
  )
  type FormValues = { current_password: string; password: string; password_confirmation: string }

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', password: '', password_confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await changePassword(values)
      reset()
      toast.success(t('password.changed'))
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        toast.error(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('password.title')}</CardTitle>
        <CardDescription>{t('password.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            id="current_password"
            label={t('password.current')}
            error={errors.current_password?.message}
          >
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.current_password}
              {...register('current_password')}
            />
          </FormField>
          <FormField
            id="new_password"
            label={t('password.new')}
            error={errors.password?.message}
            hint={ta('fields.passwordHint', { min: PASSWORD_MIN_LENGTH })}
          >
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>
          <FormField
            id="new_password_confirmation"
            label={t('password.confirm')}
            error={errors.password_confirmation?.message}
          >
            <Input
              id="new_password_confirmation"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password_confirmation}
              {...register('password_confirmation')}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            {t('password.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
