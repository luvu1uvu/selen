import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-semibold">{t('errors.notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('errors.notFoundText')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('errors.toHome')}</Link>
      </Button>
    </div>
  )
}
