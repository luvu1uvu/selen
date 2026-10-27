/**
 * Место холста страницы пространства — относительно доски (ADR-0019): какая доска у верха холста и на сколько её верх
 * выше или ниже его. Пиксели прокрутки здесь не годятся: доски ниже экрана — заглушки с высотой по оценке, и после
 * «Назад» или перезагрузки то же число пикселей приходится на другое место, пока доски выше догружаются.
 *
 * Хранится по записи истории (`location.key`), как места useScrollMemory: до закрытия вкладки (sessionStorage).
 */
export interface CanvasAnchor {
  page: string
  boardId: string
  /** Верх доски минус верх холста, px (отрицательный — доска начинается выше видимой части). */
  offset: number
}

const STORAGE_KEY = 'selen.canvasAnchor'
const anchors = new Map<string, CanvasAnchor>(readStored())
/** Записи истории, где `?board=ID` уже обработан: «Назад» к ним доску снова не разворачивает. */
const focused = new Set<string>()

function readStored(): [string, CanvasAnchor][] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (Object.entries(JSON.parse(raw)) as [string, CanvasAnchor][]) : []
  } catch {
    return []
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      const recent = [...anchors].slice(-100)
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)))
    } catch {
      // Хранилище недоступно — места живут до перезагрузки
    }
  })
}

export function rememberAnchor(key: string, anchor: CanvasAnchor) {
  anchors.delete(key)
  anchors.set(key, anchor)
}

export function anchorOf(key: string, page: string): CanvasAnchor | undefined {
  const anchor = anchors.get(key)
  return anchor?.page === page ? anchor : undefined
}

/** `?board=ID` этой записи истории уже обработан (один раз на переход, и после «Назад» к ней — тоже). */
export function takeFocus(key: string): boolean {
  if (focused.has(key)) return false
  focused.add(key)
  return true
}

/** Доска у верха видимой части холста и её сдвиг — первая (по порядку на странице), чей низ ниже верха холста. */
export function currentAnchor(canvas: HTMLElement, page: string): CanvasAnchor | undefined {
  const top = canvas.getBoundingClientRect().top
  for (const slot of canvas.querySelectorAll<HTMLElement>('[data-board-slot]')) {
    const rect = slot.getBoundingClientRect()
    if (rect.bottom > top) return { page, boardId: slot.dataset.boardSlot!, offset: rect.top - top }
  }
  return undefined
}

/** Сколько холст держит доску на месте, пока доски выше догружаются, мс. */
export const PIN_MS = 2000

/** Пользователь сам взялся за прокрутку — холст больше не держит доску на месте. */
const STOP_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Поставить доску так, чтобы её верх был на `offset` px ниже верха холста, и держать её там, пока содержимое холста
 * меняется (доски выше догружаются и растут), — не дольше 2 с и пока пользователь не прокрутил сам. Привязка
 * прокрутки браузера здесь не помогает: её якорь — первый видимый элемент, а это может быть край доски выше.
 * Возвращает «отпустить».
 */
export function pinBoard(canvas: HTMLElement, boardId: string, offset: number): () => void {
  const content = canvas.firstElementChild ?? canvas
  const align = () => {
    const slot = canvas.querySelector(`[data-board-slot="${CSS.escape(boardId)}"]`)
    if (slot)
      canvas.scrollTop +=
        slot.getBoundingClientRect().top - canvas.getBoundingClientRect().top - offset
  }
  align()
  const observer = new ResizeObserver(align)
  observer.observe(content)
  const stop = () => {
    observer.disconnect()
    window.clearTimeout(timer)
    for (const type of STOP_EVENTS) canvas.removeEventListener(type, stop)
  }
  const timer = window.setTimeout(stop, PIN_MS)
  for (const type of STOP_EVENTS) canvas.addEventListener(type, stop, { passive: true })
  return stop
}
