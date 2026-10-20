import { useCallback, useEffect, type RefObject } from 'react'
import { wheelPixels } from '@/shared/lib/useSyncedScrollLeft'

type BandStyle = Partial<
  Record<
    'position' | 'top' | 'left' | 'width' | 'zIndex' | 'transform' | 'boxShadow' | 'borderTopColor',
    string
  >
>

/** Последнее выставленное полосе состояние — стили меняются только при его смене. */
const applied = new WeakMap<HTMLElement, string>()

function apply(band: HTMLElement, key: string, style: BandStyle = {}) {
  if (applied.get(band) === key) return
  applied.set(band, key)
  band.style.position = style.position ?? ''
  band.style.top = style.top ?? ''
  band.style.left = style.left ?? ''
  band.style.width = style.width ?? ''
  band.style.zIndex = style.zIndex ?? ''
  band.style.transform = style.transform ?? ''
  band.style.boxShadow = style.boxShadow ?? ''
  band.style.borderTopColor = style.borderTopColor ?? ''
}

/**
 * Полосы дорожек закреплены и при прокрутке холста вниз (замечание PM к PR 2): полоса развёрнутой дорожки, ушедшей под
 * заголовки колонок, стоит сразу под ними, пока видна сама дорожка; полоса следующей дорожки её вытесняет.
 *
 * CSS sticky здесь не работает: полоса внутри тела доски, а тело прокручивается вбок — значит, по правилам CSS, и по
 * вертикали; sticky привязался бы к телу, а не к холсту (та же ловушка, что у заголовков колонок, ADR-0019). Поэтому
 * по прокрутке холста полоса переключается между тремя состояниями, а её место в потоке держит обёртка:
 * - в потоке — дорожка ещё не дошла до заголовков колонок;
 * - закреплена — `position: fixed` сразу под заголовками, по ширине видимой части тела: на экране не двигается, поэтому
 *   не отстаёт от прокрутки (стили пересчитываются только при смене состояния);
 * - вытесняется — стоит у низа своей дорожки (сдвиг постоянный) и уезжает вместе с ней под заголовки, освобождая место
 *   полосе следующей дорожки.
 * Свёрнутая дорожка — одна полоса, закрепляться ей некуда. Закреплённая полоса (fixed) — вне цепочки прокрутки холста
 * и тела: колесо и тачпад над ней браузер отдал бы окну, которое не прокручивается, — поэтому они пробрасываются холсту
 * (вниз-вверх) и телу доски (вбок). Возвращает пересчёт — для изменений раскладки без прокрутки.
 */
export function useStickyLaneRows(
  bodyRef: RefObject<HTMLElement | null>,
  stickyRef: RefObject<HTMLElement | null>,
) {
  const update = useCallback(() => {
    const body = bodyRef.current
    const sticky = stickyRef.current
    if (!body || !sticky) return
    const line = sticky.getBoundingClientRect().bottom
    const visible = body.getBoundingClientRect()
    for (const section of body.querySelectorAll<HTMLElement>('[data-lane-section]')) {
      const band = section.querySelector<HTMLElement>('[data-lane-row]')
      if (!band) continue
      const rect = section.getBoundingClientRect()
      const height = band.offsetHeight
      if (band.dataset.laneRow !== 'expanded' || rect.top >= line) {
        apply(band, 'flow')
      } else if (rect.bottom - height > line) {
        const left = visible.left + body.clientLeft
        apply(band, `stuck:${line}:${left}:${body.clientWidth}`, {
          position: 'fixed',
          top: `${line}px`,
          left: `${left}px`,
          width: `${body.clientWidth}px`,
          zIndex: '5',
          // Под заголовками колонок уже есть линия; своя — снизу, над уезжающими под полосу карточками
          borderTopColor: 'transparent',
          boxShadow: '0 1px 0 0 var(--color-border)',
        })
      } else {
        const offset = rect.height - height
        apply(band, `pushed:${offset}`, {
          position: 'relative',
          zIndex: '5',
          transform: `translateY(${offset}px)`,
        })
      }
    }
  }, [bodyRef, stickyRef])

  useEffect(() => {
    const body = bodyRef.current
    const sticky = stickyRef.current
    if (!body || !sticky) return
    const canvas = body.closest('[data-board-canvas]')
    const wheel = (event: WheelEvent) => {
      const band = (event.target as Element).closest<HTMLElement>('[data-lane-row]')
      if (!canvas || !band || !applied.get(band)?.startsWith('stuck')) return
      event.preventDefault()
      // Shift+колесо мыши: браузер присылает вертикальный сдвиг — это прокрутка вбок
      const shifted = event.shiftKey && event.deltaX === 0
      body.scrollLeft += wheelPixels(
        shifted ? event.deltaY : event.deltaX,
        event.deltaMode,
        body.clientWidth,
      )
      if (!shifted)
        canvas.scrollTop += wheelPixels(event.deltaY, event.deltaMode, canvas.clientHeight)
    }
    update()
    // Синхронно в обработчике прокрутки, без кадра ожидания: состояние меняется ровно на границе
    canvas?.addEventListener('scroll', update, { passive: true })
    // passive: false — иначе preventDefault не отменит прокрутку окна
    body.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(body)
    observer.observe(sticky)
    if (body.firstElementChild) observer.observe(body.firstElementChild)
    return () => {
      canvas?.removeEventListener('scroll', update)
      body.removeEventListener('wheel', wheel)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [bodyRef, stickyRef, update])

  return update
}
