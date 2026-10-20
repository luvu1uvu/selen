import { useEffect, type RefObject } from 'react'

/** Сдвиг колеса в пикселях: deltaMode 1 — строки, 2 — страницы. */
export function wheelPixels(delta: number, mode: number, page: number) {
  return mode === 1 ? delta * 16 : mode === 2 ? delta * page : delta
}

/**
 * Одна горизонтальная прокрутка на тело доски, строку заголовков колонок и полосу прокрутки внизу окна
 * (ADR-0019): заголовки и полоса повторяют `scrollLeft` тела — и наоборот (фокус Tab на кнопке дальней колонки
 * сдвигает заголовки, вслед за ними — тело).
 *
 * Над заголовками и полосой (у строки заголовков своей прокрутки нет) горизонтальное колесо тачпада
 * и Shift+колесо двигают тело; если жест в основном вертикальный — его не трогаем, и прокручивается холст.
 */
export function useSyncedScrollLeft({
  body,
  header,
  bar,
}: {
  body: RefObject<HTMLElement | null>
  header: RefObject<HTMLElement | null>
  bar: RefObject<HTMLElement | null>
}) {
  useEffect(() => {
    const main = body.current
    if (!main) return
    const elements = [main, header.current, bar.current].filter((e): e is HTMLElement => e !== null)
    const followers = elements.filter((e) => e !== main)

    // Положение, которое мы сами выставили элементу: его событие прокрутки приходит кадром позже — это эхо, а не
    // жест пользователя. Если на эхо отвечать, оно вернёт тело назад и оборвёт плавную прокрутку (инерция тачпада,
    // прокрутка dnd-kit при переносе с клавиатуры)
    const echoes = new Map<HTMLElement, number>()
    const sync = (event: Event) => {
      const source = event.currentTarget as HTMLElement
      const echo = echoes.get(source)
      echoes.delete(source)
      if (echo !== undefined && Math.abs(source.scrollLeft - echo) < 1) return
      for (const element of elements) {
        if (element !== source && Math.abs(element.scrollLeft - source.scrollLeft) >= 1) {
          element.scrollLeft = source.scrollLeft
          // Ждём эхо с тем значением, на котором элемент остановился (упёрся в край — меньше заданного)
          echoes.set(element, element.scrollLeft)
        }
      }
    }
    const wheel = (event: WheelEvent) => {
      // Shift+колесо мыши: браузер присылает вертикальный сдвиг — это прокрутка вбок
      const shifted = event.shiftKey && event.deltaX === 0
      const horizontal = shifted ? event.deltaY : event.deltaX
      const vertical = shifted ? 0 : event.deltaY
      if (horizontal === 0 || Math.abs(vertical) > Math.abs(horizontal)) return
      event.preventDefault()
      main.scrollLeft += wheelPixels(horizontal, event.deltaMode, main.clientWidth)
    }

    elements.forEach((e) => e.addEventListener('scroll', sync, { passive: true }))
    // passive: false — иначе preventDefault не отменит прокрутку холста по Shift+колесу
    followers.forEach((e) => e.addEventListener('wheel', wheel, { passive: false }))
    // Начальное положение — как у тела (например, восстановленное после «Назад»)
    followers.forEach((e) => (e.scrollLeft = main.scrollLeft))
    return () => {
      elements.forEach((e) => e.removeEventListener('scroll', sync))
      followers.forEach((e) => e.removeEventListener('wheel', wheel))
    }
  }, [body, header, bar])
}
