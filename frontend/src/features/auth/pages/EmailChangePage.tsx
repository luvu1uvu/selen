import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getErrorMessage } from '@/shared/api/errors'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { confirmEmailChange, fetchEmailChange } from '../api'

/**
 * Подтверждение нового email по ссылке из письма (смена администратором, П2c-2, LATER-9). Открыть страницу мало —
 * email меняет только кнопка: почтовые сканеры, которые сами открывают ссылки из писем, его не сменят. Доступна и
 * гостям, и вошедшим; после подтверждения сеансы человека завершены — дальше вход с новым адресом.
 */
export function EmailChangePage() {
  const { t } = useTranslation('auth')
  const { t: tc } = useTranslation()
  const { token = '' } = useParams()

  const request = useQuery({
    queryKey: ['email-change', token],
    queryFn: () => fetchEmailChange(token),
    retry: false,
  })
  const confirm = useMutation({ mutationFn: () => confirmEmailChange(token) })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t('emailChange.title')}</CardTitle>
        {request.data && !confirm.isSuccess && (
          <CardDescription>
            {t('emailChange.description', { email: request.data.email })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
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
        {confirm.isError && (
          <Alert variant="destructive">
            {getErrorMessage(confirm.error, tc('errors.generic'))}
          </Alert>
        )}
        {confirm.isSuccess ? (
          <Alert role="status">{t('emailChange.success', { email: confirm.data.email })}</Alert>
        ) : (
          request.data && (
            <>
              <p className="text-muted-foreground text-sm">{t('emailChange.note')}</p>
              <Button
                className="w-full"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {t('emailChange.submit')}
              </Button>
            </>
          )
        )}
        <Link to="/login" className="text-muted-foreground text-center text-sm hover:underline">
          {t('emailChange.toLogin')}
        </Link>
      </CardContent>
    </Card>
  )
}
