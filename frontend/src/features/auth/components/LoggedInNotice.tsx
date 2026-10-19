import { useTranslation } from 'react-i18next'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { useCurrentUser, useLogout } from '../queries'

/**
 * Предупреждение на гостевых страницах по ссылкам из писем (приглашение, сброс пароля),
 * если в этом браузере уже выполнен вход под другим пользователем.
 */
export function LoggedInNotice() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logoutMutation = useLogout()

  if (!user) return null

  return (
    <Alert className="grid gap-3">
      <span>{t('session.loggedInAs', { name: user.name })}</span>
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={logoutMutation.isPending}
        onClick={() => logoutMutation.mutate()}
      >
        {t('nav.logout')}
      </Button>
    </Alert>
  )
}
