import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import '@/shared/i18n'
import { server } from './server'

// findBy*/waitFor ждут 1 с по умолчанию: под нагрузкой (покрытие, файлы тестов параллельно — make test, CI)
// этого не хватает, и падают случайные тесты, хотя интерфейс верен. 3 с — с запасом, тест всё равно ограничен 5 с
configure({ asyncUtilTimeout: 3000 })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  // Тема — на <html> и в localStorage (ADR-0025): следующий тест начинает со светлой
  document.documentElement.classList.remove('dark', 'theme-switching')
  document.documentElement.style.colorScheme = ''
  window.localStorage.removeItem('selen.theme')
})
afterAll(() => server.close())

// jsdom не реализует ResizeObserver и некоторые API указателя, которые используют компоненты Radix UI
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.hasPointerCapture ??= () => false
// sonner захватывает указатель при нажатии на уведомление (смахивание)
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

// Визуальный редактор (ProseMirror) меряет положение выделения — в jsdom у Range этих методов нет
if (!Range.prototype.getClientRects) {
  const empty = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 }
  Range.prototype.getBoundingClientRect = () => ({ ...empty, toJSON: () => empty }) as DOMRect
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList
}
if (!document.elementFromPoint) document.elementFromPoint = () => null
