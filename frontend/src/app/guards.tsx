import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useCurrentUser } from '@/features/auth/queries'
import { appReturnPath, fileReturnPath, openServerPage } from '@/shared/lib/browser'
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

/** Куда вернуть после входа (`RequireAuth` → `RequireGuest`) и кого: сессия закончилась — её пользователь. */
interface ReturnState {
  from?: unknown
  userId?: unknown
}

/**
 * Только для вошедших пользователей; остальных отправляет на /login и запоминает, откуда (с параметрами адреса:
 * `?board=` открытой доски), — после входа `RequireGuest` вернёт туда (LATER-104). Если на вход отправила
 * закончившаяся сессия (401), запоминается и её пользователь: вернётся на страницу только он, другой войдёт на главную
 * и не увидит в адресе, что открывал прежний (аудит LATER-104, S-2). Гость по ссылке — без пользователя: вернётся
 * любой вошедший.
 */
export function RequireAuth() {
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()
  // Последний вошедший в этой вкладке (подстройка состояния при рендере): после 401 пользователь уже null
  const [lastUser, setLastUser] = useState<string | null>(null)
  if (user && user.id !== lastUser) setLastUser(user.id)

  if (isPending) return <FullPageLoader />
  if (!user) {
    const state: ReturnState = {
      from: location.pathname + location.search + location.hash,
      userId: lastUser ?? undefined,
    }
    return <Navigate to="/login" replace state={state} />
  }
  return <Outlet />
}

/**
 * Пока браузер открывает файл. Документ (и «Скачать») браузер скачивает, оставаясь на этой странице, — поэтому
 * подсказка и путь в приложение, а не вечная «Загрузка…». Оформление — как у экрана ошибки (`ErrorState`).
 */
function OpeningFile() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-xl font-semibold">{t('states.openingFile')}</h1>
      <p className="text-muted-foreground max-w-md">{t('states.openingFileHint')}</p>
      <Button asChild variant="outline">
        <Link to="/" replace>
          {t('errors.toHome')}
        </Link>
      </Button>
    </div>
  )
}

/**
 * Только для гостей (вход, «забыли пароль»); вошедших отправляет на главную, пришедших по ссылке на файл
 * (`/login?next=/files/<id>`, UI-1b) — к файлу, а отправленных на вход со страницы приложения (`state.from`
 * от `RequireAuth`) — обратно на неё (LATER-104): и после входа формой, и уже вошедших. Переход — только здесь:
 * форма входа сама не переходит, иначе гонка — этот guard узнаёт пользователя раньше и уводит на главную.
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
  if (user) {
    const state = location.state as ReturnState | null
    const sameUser = state?.userId === undefined || state.userId === user.id
    const from = sameUser ? appReturnPath(state?.from) : null
    return <Navigate to={from ?? '/'} replace />
  }
  return <Outlet />
}

/** Только для администраторов. Проверка на клиенте — для удобства; доступ проверяет API. */
export function RequireAdmin() {
  const { data: user } = useCurrentUser()

  if (!isSystemAdmin(user)) return <Navigate to="/" replace />
  return <Outlet />
}
