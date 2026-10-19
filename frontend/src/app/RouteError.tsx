import { useEffect } from 'react'
import { useMatches, useRouteError } from 'react-router'
import { ErrorState } from '@/shared/components/ErrorState'
import type { RouteHandle } from './routeHandle'

/**
 * errorElement маршрутов: вместо белого экрана React Router «Unexpected Application Error» — понятный экран.
 * Внутри каркаса приложения полоса разделов и дерево остаются (маршрут без пути вокруг страниц). На странице-холсте
 * (доска) каркас не даёт отступов и прокрутки — экран ошибки добавляет свои.
 */
export function RouteError({ fullScreen = false }: { fullScreen?: boolean }) {
  const error = useRouteError()
  const canvas = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.canvas)
  useEffect(() => console.error(error), [error])
  const state = <ErrorState fullScreen={fullScreen} />
  return canvas && !fullScreen ? (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">{state}</div>
  ) : (
    state
  )
}
