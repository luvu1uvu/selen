import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { LoggedInNotice } from '@/features/auth/components/LoggedInNotice'
import { currentUserKey } from '@/features/auth/queries'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@/features/auth/schemas'
import {
  applyValidationErrors,
  getErrorBody,
  getErrorMessage,
  getErrorStatus,
} from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/dates'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { acceptInvitation, fetchInvitation } from './api'

const KNOWN_ERROR_CODES = [
  'invitation_expired',
  'invitation_used',
  'invitation_revoked',
  'invitation_superseded',
  'invitation_invalid',
] as const
type InvitationErrorCode = (typeof KNOWN_ERROR_CODES)[number]

function toErrorCode(error: unknown): InvitationErrorCode | null {
  const code = getErrorBody(error)?.code
  return KNOWN_ERROR_CODES.find((known) => known === code) ?? null
}

export function AcceptInvitationPage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)

  const invitationQuery = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => fetchInvitation(token),
    retry: false,
  })

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
      const user = await acceptInvitation(token, values)
      queryClient.setQueryData(currentUserKey, user)
      navigate('/', { replace: true })
    } catch (error) {
      const code = toErrorCode(error)
      if (code) {
        setFormError(t(`invitation.errors.${code}`))
      } else if (!applyValidationErrors(error, setError)) {
        setFormError(getErrorMessage(error, tc('errors.generic')))
      }
    }
  })

  // 404/410 — проблема со ссылкой; остальное (сеть, 5xx) — временная ошибка сервера
  const loadStatus = invitationQuery.isError ? getErrorStatus(invitationQuery.error) : undefined
  const loadErrorCode =
    loadStatus === 404 || loadStatus === 410
      ? (toErrorCode(invitationQuery.error) ?? 'invitation_invalid')
      : null
  const loadFailed = invitationQuery.isError && loadErrorCode === null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {invitationQuery.data
            ? t('invitation.greeting', { name: invitationQuery.data.name })
            : t('invitation.title')}
        </CardTitle>
        {invitationQuery.data && (
          <CardDescription>
            {t('invitation.description', { email: invitationQuery.data.email })}{' '}
            {t('invitation.expiresAt', { date: formatDateTime(invitationQuery.data.expires_at) })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoggedInNotice />
        {invitationQuery.isPending && (
          <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
        )}
        {loadFailed && (
          <Alert variant="destructive" className="grid gap-3">
            <span>{tc('errors.loadFailed')}</span>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => invitationQuery.refetch()}
            >
              {tc('actions.retry')}
            </Button>
          </Alert>
        )}
        {loadErrorCode && (
          <>
            <Alert variant="destructive">{t(`invitation.errors.${loadErrorCode}`)}</Alert>
            <Link to="/login" className="text-muted-foreground text-center text-sm hover:underline">
              {t('invitation.toLogin')}
            </Link>
          </>
        )}
        {invitationQuery.data && (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {formError && <Alert variant="destructive">{formError}</Alert>}
            <FormField
              id="password"
              label={t('fields.password')}
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
              {isSubmitting ? t('invitation.submitting') : t('invitation.submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
