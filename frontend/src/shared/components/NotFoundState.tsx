import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

/** «Не найдено» внутри каркаса приложения (чужой или несуществующий объект). */
export function NotFoundState({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('errors.toHome')}</Link>
      </Button>
    </div>
  )
}
