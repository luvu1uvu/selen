import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useCurrentUser } from '@/features/auth/queries'
import { isSystemAdmin } from '@/shared/lib/roles'

function FullPageLoader() {
  const { t } = useTranslation()
  return (
    <div className="text-muted-foreground flex min-h-svh items-center justify-center text-sm">
      {t('states.loading')}
    </div>
  )
}

/** Только для вошедших пользователей; остальных отправляет на /login. */
export function RequireAuth() {
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()

  if (isPending) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Только для гостей (вход, «забыли пароль»); вошедших отправляет на главную. */
export function RequireGuest() {
  const { data: user, isPending } = useCurrentUser()

  if (isPending) return <FullPageLoader />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

/** Только для администраторов. Проверка на клиенте — для удобства; доступ проверяет API. */
export function RequireAdmin() {
  const { data: user } = useCurrentUser()

  if (!isSystemAdmin(user)) return <Navigate to="/" replace />
  return <Outlet />
}
