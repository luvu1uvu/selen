import { useTranslation } from 'react-i18next'
import { useMatches } from 'react-router'
import { cn } from '@/shared/lib/utils'
import type { RouteHandle } from './routeHandle'

/**
 * Заглушка страницы при первой загрузке приложения, пока не пришёл код страницы, которая грузится отдельным чанком
 * (`lazy` в routes.tsx): React Router рисует её на месте страницы (HydrateFallback), полоса разделов и дерево уже
 * видны. Без неё на этом месте было пусто, а в консоли при каждой загрузке — предупреждение «No `HydrateFallback`
 * element provided». На странице-холсте каркас не даёт отступов — заглушка добавляет свои, как RouteError.
 */
export function RouteLoading() {
  const { t } = useTranslation()
  const canvas = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.canvas)
  return (
    <p className={cn('text-muted-foreground text-sm', canvas && 'p-4 md:p-8')}>
      {t('states.loading')}
    </p>
  )
}
