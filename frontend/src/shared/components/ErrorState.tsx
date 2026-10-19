import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'

/**
 * Экран непойманной ошибки: понятный текст без трассировки, «Обновить страницу» и «На главную».
 * Обе кнопки — полная перезагрузка: состояние приложения после сбоя ненадёжно.
 */
export function ErrorState({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className={
        fullScreen
          ? 'flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center'
          : 'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center'
      }
    >
      <h1 className="text-xl font-semibold">{t('errors.crashTitle')}</h1>
      <p className="text-muted-foreground max-w-md">{t('errors.crashText')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
        <Button asChild variant="outline">
          <a href="/">{t('errors.toHome')}</a>
        </Button>
      </div>
    </div>
  )
}
