import { expect, type Browser, type Locator, type Page } from '@playwright/test'
import { authFile, type User } from '../../tests/helpers'

/**
 * Общие шаги приёмочных автотестов «Редизайна», шаг 2 (docs/stages/redesign.md, ТК-RD2.1–RD2.9): облик «Линия»,
 * тёмная тема, переключатель темы, рамка фокуса.
 *
 * Данные — E2eSeeder вместо демо-данных:
 * - светлая тема: Анна → e2e-admin (тема «Светлая»), «Разработка» / «Продукт» → пространство THEME «Тёмная тема», доска
 *   «Вид» (E2eSeeder::themePrep);
 * - тёмная тема: Анна и admin@selen.test → e2e-dark (сохранена «Тёмная», системный администратор), пространство DARK
 *   «Тёмная проверка», доска «Вид», карточки DARK-1…DARK-6 (E2eSeeder::darkTheme).
 * Тест, который меняет тему пользователя на сервере, в конце возвращает её (resetTheme): e2e-admin — «Светлая»,
 * e2e-dark — «Тёмная», на них держатся остальные тесты.
 */

export const LIGHT = { space: 'Тёмная тема', board: 'Вид', user: 'e2e-admin@selen.test' } as const
export const DARK = { space: 'Тёмная проверка', board: 'Вид', user: 'e2e-dark@selen.test' } as const

export type Theme = 'light' | 'dark' | 'system'
export const THEME_LABEL = { light: 'Светлая', dark: 'Тёмная', system: 'Как в системе' } as const

/** Акцент «Линии» и цвет рамки фокуса: светлая — индиго #4f46e5, тёмная — светло-сиреневый #8b8cf8 (index.css). */
export const RING = { light: 'rgb(79, 70, 229)', dark: 'rgb(139, 140, 248)' } as const

/** Сейчас на экране тёмная тема (класс `dark` на <html>). */
export const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

/** На экране тема: класс `dark`, `color-scheme` и фон страницы (светлая — белый, тёмная — #19191c). */
export async function expectShownTheme(page: Page, theme: 'light' | 'dark') {
  await expect.poll(() => isDark(page), `на экране — ${theme === 'dark' ? 'тёмная' : 'светлая'} тема`).toBe(theme === 'dark')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme)
  await expect(page.locator('body')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(25, 25, 28)' : 'rgb(255, 255, 255)')
}

/** Пункт темы в меню пользователя. */
export const themeItem = (page: Page, theme: Theme) => page.getByRole('menuitemradio', { name: THEME_LABEL[theme] })

/**
 * Выбрать тему в меню пользователя, как человек: открыть меню (если закрыто) и щёлкнуть пункт; ждём, пока выбор
 * сохранится на сервере. Меню после выбора остаётся открытым.
 */
export async function chooseTheme(page: Page, theme: Theme) {
  const item = themeItem(page, theme)
  if (!(await item.isVisible())) await page.getByRole('button', { name: 'Меню пользователя' }).click()
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/v1/profile/theme') && r.request().method() === 'PUT')
  await item.click()
  expect((await saved).ok(), 'выбор темы сохранён на сервере').toBe(true)
  await expect(item).toHaveAttribute('aria-checked', 'true')
}

/**
 * Вернуть пользователю тему на сервере — в своём контексте браузера (страница теста может быть в любом состоянии).
 * Запрос — как у SPA: XSRF из cookie, X-Selen-User — пользователь сессии (ADR-0002).
 */
export async function resetTheme(browser: Browser, user: User, theme: Theme) {
  const context = await browser.newContext({ storageState: authFile(user) })
  try {
    const page = await context.newPage()
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const status = await page.evaluate(async (theme) => {
      const xsrf = decodeURIComponent(
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('XSRF-TOKEN='))
          ?.slice('XSRF-TOKEN='.length) ?? '',
      )
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrf,
      }
      const me = (await (await fetch('/api/v1/auth/me', { headers })).json()) as { data: { id: string } }
      const response = await fetch('/api/v1/profile/theme', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', 'X-Selen-User': me.data.id },
        body: JSON.stringify({ theme }),
      })
      return response.status
    }, theme)
    expect(status, `тема ${user} возвращена: ${theme}`).toBe(200)
  } finally {
    await context.close()
  }
}

/** Рамка элемента (outline) после переходов: у кнопок `transition-all` — сразу после фокуса значения промежуточные. */
export async function outlineOf(locator: Locator) {
  return locator.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished))
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset }
  })
}

/** Общая рамка фокуса: 2 px цветом акцента с отступом 2 px (решение PM 26.10, шаг 1, п. 5). */
export const focusRing = (theme: 'light' | 'dark') => ({ style: 'solid', width: '2px', color: RING[theme], offset: '2px' })

/** Рамка пункта меню в фокусе с клавиатуры — внутри пункта (LATER-115). */
export const innerRing = (theme: 'light' | 'dark') => ({ style: 'solid', width: '2px', color: RING[theme], offset: '-2px' })

/** Перевести фокус на элемент клавиатурой: Shift+Tab с него и Tab обратно — фокус «с клавиатуры» (:focus-visible). */
export async function focusWithKeyboard(page: Page, target: Locator) {
  await target.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

/** Вычисленный цвет CSS (rgb, oklch…) → sRGB 0–255 через холст 1×1 — так, как его рисует браузер. */
export async function rgbOf(page: Page, color: string) {
  return page.evaluate((color) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#000'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: Math.round((a / 255) * 100) / 100 }
  }, color)
}

export type Rgb = { r: number; g: number; b: number }

/** Относительная яркость по WCAG. */
export function luminance({ r, g, b }: Rgb) {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Контраст двух непрозрачных цветов по WCAG (1–21). */
export function contrast(a: Rgb, b: Rgb) {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Цвета элемента: фон, текст, верхняя граница (ширина и цвет), тень. */
export async function styleOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      background: style.backgroundColor,
      color: style.color,
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      boxShadow: style.boxShadow,
      fontWeight: Number(style.fontWeight),
      fontFamily: style.fontFamily,
      fontVariantNumeric: style.fontVariantNumeric,
      fontSize: style.fontSize,
      colorScheme: style.colorScheme,
    }
  })
}

/**
 * Рамка фокуса элемента целиком видна: прямоугольник рамки (элемент + отступ + толщина) не выходит за область отсечения
 * ни одного предка с overflow (прокручиваемый список дерева, колонка доски, холст).
 */
export async function ringClipping(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
    const r = element.getBoundingClientRect()
    const ring = { top: r.top - grow, left: r.left - grow, right: r.right + grow, bottom: r.bottom + grow }
    const clipped: string[] = []
    for (let e = element.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (!/(auto|scroll|hidden|clip)/.test(`${s.overflowX} ${s.overflowY}`)) continue
      const box = e.getBoundingClientRect()
      const top = box.top + e.clientTop
      const left = box.left + e.clientLeft
      const sides = [
        ring.top < top - 0.5 && 'сверху',
        ring.left < left - 0.5 && 'слева',
        ring.right > left + e.clientWidth + 0.5 && 'справа',
        ring.bottom > top + e.clientHeight + 0.5 && 'снизу',
      ].filter(Boolean)
      if (sides.length) clipped.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)}: ${sides.join(', ')}`)
    }
    return clipped
  })
}
