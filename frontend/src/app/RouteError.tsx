import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { ErrorState } from '@/shared/components/ErrorState'

/**
 * errorElement маршрутов: вместо белого экрана React Router «Unexpected Application Error» — понятный экран.
 * Внутри каркаса приложения полоса разделов и дерево остаются (маршрут без пути вокруг страниц).
 */
export function RouteError({ fullScreen = false }: { fullScreen?: boolean }) {
  const error = useRouteError()
  useEffect(() => console.error(error), [error])
  return <ErrorState fullScreen={fullScreen} />
}
