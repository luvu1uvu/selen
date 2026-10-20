import { useEffect, useState, type RefObject } from 'react'

/**
 * Блок подошёл к видимой части холста (с запасом — экран сверху и снизу, ADR-0019, «Производительность»): тогда доска
 * загружается и рисуется. Один раз «да» — навсегда: загруженная доска остаётся в DOM. Без IntersectionObserver
 * (старый браузер, тесты) — сразу «да».
 */
export function useNearViewport(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = ref.current
    if (!element || near || !enabled) return
    const root = element.closest<HTMLElement>('[data-board-canvas]')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { root, rootMargin: '100% 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, near, enabled])

  return near
}
