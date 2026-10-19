import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { requestPasswordReset } from '../api'
import { emailSchema } from '../schemas'

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const schema = useMemo(() => z.object({ email: emailSchema(t) }), [t])
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        setFormError(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('forgot.title')}</CardTitle>
        <CardDescription>{t('forgot.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sent ? (
          <Alert variant="success">{t('forgot.sent')}</Alert>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {formError && <Alert variant="destructive">{formError}</Alert>}
            <FormField id="email" label={t('fields.email')} error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </FormField>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {t('forgot.submit')}
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
