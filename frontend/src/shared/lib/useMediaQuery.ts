import { useSyncExternalStore } from 'react'

/**
 * Совпадает ли медиазапрос (`(min-width: 48rem)` — точка `md` Tailwind) и обновление при смене ширины окна. Без
 * `matchMedia` (jsdom в тестах) — `fallback`.
 */
export function useMediaQuery(query: string, fallback = true) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
  )
}
