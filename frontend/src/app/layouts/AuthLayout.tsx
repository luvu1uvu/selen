import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'

/** Оформление гостевых страниц: логотип и карточка по центру. */
export function AuthLayout() {
  const { t } = useTranslation()
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <div className="text-2xl font-semibold tracking-tight">{t('appName')}</div>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  )
}
