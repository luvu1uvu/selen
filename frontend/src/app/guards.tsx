import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useCurrentUser } from '@/features/auth/queries'
import { fileReturnPath, openServerPage } from '@/shared/lib/browser'
import { isSystemAdmin } from '@/shared/lib/roles'
import { Button } from '@/shared/ui/button'

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

/**
 * Пока браузер открывает файл. Документ (и «Скачать») браузер скачивает, оставаясь на этой странице, — поэтому
 * подсказка и путь в приложение, а не вечная «Загрузка…».
 */
function OpeningFile() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
      <p>{t('states.openingFile')}</p>
      <p className="text-muted-foreground text-sm">{t('states.openingFileHint')}</p>
      <Button asChild variant="outline">
        <Link to="/" replace>
          {t('errors.toHome')}
        </Link>
      </Button>
    </div>
  )
}

/**
 * Только для гостей (вход, «забыли пароль»); вошедших отправляет на главную, а пришедших по ссылке на файл
 * (`/login?next=/files/<id>`, UI-1b) — к файлу: и после входа формой, и уже вошедших. Переход — только здесь.
 */
export function RequireGuest() {
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()
  const file = user ? fileReturnPath(location.search) : null
  const opened = useRef<string | null>(null)

  useEffect(() => {
    // Один переход на адрес: повторная отрисовка (и двойной запуск эффектов в StrictMode) файл заново не открывает
    if (file && opened.current !== file) {
      opened.current = file
      openServerPage(file)
    }
  }, [file])

  if (isPending) return <FullPageLoader />
  if (file) return <OpeningFile />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

/** Только для администраторов. Проверка на клиенте — для удобства; доступ проверяет API. */
export function RequireAdmin() {
  const { data: user } = useCurrentUser()

  if (!isSystemAdmin(user)) return <Navigate to="/" replace />
  return <Outlet />
}
