import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/** Запомненное место: на какой странице и где была прокрутка. */
interface Place {
  page: string
  value: number
}

/**
 * Места прокрутки по записям истории браузера: ключ — `location.key` записи и имя контейнера. Живут до закрытия
 * вкладки (sessionStorage, как у ScrollRestoration React Router), переживают перезагрузку страницы. Страница
 * хранится вместе с местом: у первой записи вкладки ключ всегда `default`, и без этого новая загрузка другой
 * страницы получила бы чужое место.
 */
const STORAGE_KEY = 'selen.scroll'
const positions = new Map<string, Place>(readStored())

function readStored(): [string, Place][] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? (Object.entries(JSON.parse(raw)) as [string, Place][]) : []
  } catch {
    return []
  }
}

/** Последнее записанное — в конец: при сохранении в хранилище остаются самые свежие места. */
function remember(key: string, place: Place) {
  positions.delete(key)
  positions.set(key, place)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      // Последние 100 мест — хватает для истории вкладки и не раздувает хранилище
      const recent = [...positions].slice(-100)
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)))
    } catch {
      // Хранилище недоступно — места живут до перезагрузки
    }
  })
}

/** Сколько ждать, пока содержимое дорастёт до запомненного места (данные грузятся после перехода). */
const RESTORE_TIMEOUT_MS = 2000

/**
 * Прокрутка контейнера (не окна: окно в приложении не прокручивается — ADR-0019) при переходах:
 * - новая страница (`page` сменился переходом по ссылке) — с начала;
 * - «Назад» / «Вперёд» и перезагрузка — на место, где была эта запись истории; если содержимое ещё грузится,
 *   место восстанавливается, когда оно дорастёт (не дольше 2 с и пока пользователь сам не начал прокручивать);
 * - та же страница с другим адресом (например, открыли карточку поверх доски) — прокрутка не трогается.
 *
 * `name` различает контейнеры одной страницы (холст и горизонтальная прокрутка доски), `ready` — контейнер
 * показан и содержимое отрисовано (до этого восстанавливать нечего; пока не готов — страница считается новой).
 * `restore: false` — место при «Назад» ставит сама страница (холст пространства — по доске, canvasAnchor): прокрутка
 * не трогается, ни в начало, ни на запомненные пиксели.
 */
export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  {
    name,
    page,
    axis = 'y',
    ready = true,
    restore = true,
  }: { name: string; page: string; axis?: 'x' | 'y'; ready?: boolean; restore?: boolean },
) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const key = `${location.key}:${name}`
  // Что показано сейчас и не ждёт ли восстановление, пока дорастёт содержимое
  const shown = useRef<{ page: string; key: string; restoring: boolean } | null>(null)

  // Запоминаем место для текущей записи истории при каждой прокрутке. Элемент — в зависимостях через ready и key:
  // пока контейнер не показан, ready=false, и после повторного появления обработчик вешается заново
  useEffect(() => {
    const element = ref.current
    if (!element || !ready) return
    const save = () =>
      remember(key, { page, value: axis === 'y' ? element.scrollTop : element.scrollLeft })
    element.addEventListener('scroll', save, { passive: true })
    return () => element.removeEventListener('scroll', save)
  }, [ref, axis, ready, key, page])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !ready) {
      shown.current = null
      return
    }
    const set = (value: number) => {
      if (axis === 'y') element.scrollTop = value
      else element.scrollLeft = value
    }
    const current = () => (axis === 'y' ? element.scrollTop : element.scrollLeft)

    const previous = shown.current
    // Повтор эффекта без перехода (StrictMode, смена зависимостей) — ничего не трогаем, разве что не дождались
    // содержимого для восстановления
    if (previous?.key === key && previous.page === page && !previous.restoring) return
    // Та же страница под другим адресом — место остаётся и запоминается для новой записи истории
    if (previous && previous.key !== key && previous.page === page) {
      shown.current = { page, key, restoring: false }
      remember(key, { page, value: current() })
      return
    }

    const saved = navigationType === 'POP' ? positions.get(key) : undefined
    if (saved === undefined || saved.page !== page) {
      shown.current = { page, key, restoring: false }
      set(0)
      return
    }
    if (!restore) {
      shown.current = { page, key, restoring: false }
      return
    }
    shown.current = { page, key, restoring: true }
    const done = () => {
      if (shown.current?.key === key) shown.current.restoring = false
    }
    set(saved.value)
    if (Math.abs(current() - saved.value) <= 1) {
      done()
      return
    }

    // Содержимое ещё не дорисовано — ждём, пока контейнер дорастёт; пользователь прокрутил сам — не мешаем
    const content = element.firstElementChild
    let observer: ResizeObserver | null = null
    let timer = 0
    const cleanup = () => {
      observer?.disconnect()
      observer = null
      element.removeEventListener('wheel', finish)
      element.removeEventListener('touchstart', finish)
      element.removeEventListener('keydown', finish)
      window.clearTimeout(timer)
    }
    function finish() {
      cleanup()
      done()
    }
    if (content && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        set(saved.value)
        if (Math.abs(current() - saved.value) <= 1) finish()
      })
      observer.observe(content)
    }
    element.addEventListener('wheel', finish, { passive: true })
    element.addEventListener('touchstart', finish, { passive: true })
    element.addEventListener('keydown', finish)
    timer = window.setTimeout(finish, RESTORE_TIMEOUT_MS)
    // Сброс эффекта (переход, StrictMode) — только снять ожидание; restoring остаётся, и повтор продолжит
    return cleanup
  }, [ref, axis, ready, restore, page, navigationType, key])
}
