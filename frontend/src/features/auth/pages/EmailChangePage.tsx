import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { applyValidationErrors, getErrorBody, getErrorMessage } from '@/shared/api/errors'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { confirmEmailChange, fetchEmailChange } from '../api'

/**
 * Подтверждение нового email по ссылке из письма (смена администратором, П2c-2, LATER-9). Открыть страницу мало — email
 * меняет только «Подтвердить адрес» с нынешним паролем учётной записи (решение PM 28.10 по ревью): почтовые сканеры,
 * администратор, поставивший свой адрес, и посторонний, которому письмо ушло по опечатке, его не сменят. Доступна и
 * гостям, и вошедшим; после подтверждения сеансы человека завершены — дальше вход с новым адресом.
 */
export function EmailChangePage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { token = '' } = useParams()
  const [changedTo, setChangedTo] = useState<string | null>(null)
  // Форма с кнопкой исчезает — фокус на сообщение об успехе, а не в никуда (правила вида, раздел 11; UX-ревью П2c-2, U-9)
  const success = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (changedTo !== null) success.current?.focus()
  }, [changedTo])

  // Ссылка одноразовая: после подтверждения повторный запрос ответил бы «недействительна» — не перечитываем
  const request = useQuery({
    queryKey: ['email-change', token],
    queryFn: () => fetchEmailChange(token),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: changedTo === null,
  })

  const schema = useMemo(
    () => z.object({ password: z.string().min(1, t('validation.passwordRequired')) }),
    [t],
  )
  type FormValues = z.infer<typeof schema>
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: '' } })

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      setChangedTo((await confirmEmailChange(token, password)).email)
    } catch (error) {
      // Неверный пароль — под полем; ссылка устарела или адрес занят (ошибка token) — сообщением над формой
      if (!getErrorBody(error)?.errors?.password || !applyValidationErrors(error, setError)) {
        setError('root', { message: getErrorMessage(error, tc('errors.generic')) })
      }
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('emailChange.title')}</CardTitle>
        {request.data && changedTo === null && (
          <CardDescription>
            {t('emailChange.description', { email: request.data.email })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {changedTo !== null ? (
          <Alert ref={success} role="status" tabIndex={-1}>
            {t('emailChange.success', { email: changedTo })}
          </Alert>
        ) : (
          <>
            {request.isPending && (
              <p className="text-muted-foreground text-sm" role="status">
                {t('emailChange.checking')}
              </p>
            )}
            {request.isError && (
              <Alert variant="destructive">
                {getErrorMessage(request.error, tc('errors.generic'))}
              </Alert>
            )}
            {request.data && (
              <form onSubmit={onSubmit} className="grid gap-4" noValidate>
                {errors.root?.message && <Alert variant="destructive">{errors.root.message}</Alert>}
                <p className="text-muted-foreground text-sm">{t('emailChange.note')}</p>
                <FormField
                  id="email-change-password"
                  label={t('emailChange.password')}
                  hint={t('emailChange.passwordHint')}
                  error={errors.password?.message}
                >
                  <Input
                    id="email-change-password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    aria-invalid={!!errors.password}
                    {...register('password')}
                  />
                </FormField>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {t('emailChange.submit')}
                </Button>
              </form>
            )}
          </>
        )}
        <Link to="/login" className="text-muted-foreground text-center text-sm hover:underline">
          {t('emailChange.toLogin')}
        </Link>
      </CardContent>
    </Card>
  )
}
