import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { resetPassword } from '../api'
import { LoggedInNotice } from '../components/LoggedInNotice'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '../schemas'

export function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [formError, setFormError] = useState<string | null>(null)

  const schema = useMemo(() => newPasswordSchema(t), [t])
  type FormValues = { password: string; password_confirmation: string }

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', password_confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await resetPassword({ token, email, ...values })
      navigate('/login', { replace: true, state: { notice: t('reset.success') } })
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        setFormError(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  // Ошибка по токену/email приходит как ошибка валидации поля email
  const linkError = (errors as Record<string, { message?: string }>).email?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('reset.title')}</CardTitle>
        <CardDescription>{t('reset.description', { email })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoggedInNotice />
        {!token || !email ? (
          <Alert variant="destructive">{t('reset.invalidLink')}</Alert>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {formError && <Alert variant="destructive">{formError}</Alert>}
            {linkError && <Alert variant="destructive">{linkError}</Alert>}
            <FormField
              id="password"
              label={t('fields.newPassword')}
              error={errors.password?.message}
              hint={t('fields.passwordHint', { min: PASSWORD_MIN_LENGTH })}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                aria-invalid={!!errors.password}
                {...register('password')}
              />
            </FormField>
            <FormField
              id="password_confirmation"
              label={t('fields.passwordConfirmation')}
              error={errors.password_confirmation?.message}
            >
              <Input
                id="password_confirmation"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password_confirmation}
                {...register('password_confirmation')}
              />
            </FormField>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {t('reset.submit')}
            </Button>
          </form>
        )}
        <Link to="/login" className="text-muted-foreground text-center text-sm hover:underline">
          {t('forgot.backToLogin')}
        </Link>
      </CardContent>
    </Card>
  )
}
