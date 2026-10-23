import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'
import { applyValidationErrors, getErrorMessage } from '@/shared/api/errors'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Checkbox } from '@/shared/ui/checkbox'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { useLogin } from '../queries'
import { emailSchema } from '../schemas'

interface LocationState {
  notice?: string
}

export function LoginPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const loginMutation = useLogin()
  const [formError, setFormError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: emailSchema(t),
        password: z.string().min(1, t('validation.passwordRequired')),
        remember: z.boolean(),
      }),
    [t],
  )
  type FormValues = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      // Куда дальше (главная, страница, с которой отправили на вход, или файл) — решает RequireGuest, как только
      // узнает пользователя (LATER-104)
      await loginMutation.mutateAsync(values)
    } catch (error) {
      if (!applyValidationErrors(error, setError)) {
        setFormError(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('login.title')}</CardTitle>
        <CardDescription>{t('login.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {state.notice && <Alert variant="success">{state.notice}</Alert>}
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
          <FormField id="password" label={t('fields.password')} error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </FormField>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Controller
                name="remember"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="remember"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <Label htmlFor="remember" className="font-normal">
                {t('login.remember')}
              </Label>
            </div>
            <Link to="/forgot-password" className="text-muted-foreground text-sm hover:underline">
              {t('login.forgot')}
            </Link>
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
