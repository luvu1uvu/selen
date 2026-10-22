import { expect, type Locator, type Page } from '@playwright/test'
import { openBoard, openHome } from '../../tests/helpers'

/**
 * Общие шаги приёмочных автотестов LATER-91 — подготовка к тёмной теме (docs/stages/later-91.md, ТК-L91.3–L91.7).
 *
 * Данные — E2eSeeder: «Разработка» демо-данных → пространство THEME «Тёмная тема», доска «Продукт» → доска «Вид»
 * (E2eSeeder::themePrep: заблокированная, срочная, просроченная карточки, сроки «в срок» и «после срока», метки цветов
 * демо-данных, ответственные). Анна (администратор «Разработки») — e2e-admin в THEME; пустая папка «Новые
 * направления» → «E2E Пустая» (видна только Владельцу, e2e-owner).
 *
 * Цвета проверяются вычисленными (getComputedStyle) и переводятся в sRGB так, как их рисует браузер, — через холст 1×1:
 * токены index.css заданы в oklch, и getComputedStyle отдаёт oklch/oklab. Контраст — по формуле WCAG.
 */

export const SPACE = 'Тёмная тема'
export const BOARD = 'Вид'

/** Цвет в sRGB: каналы 0–255 и прозрачность 0–1. */
export type Rgba = { r: number; g: number; b: number; a: number }

/** Цвета Tailwind 4 из прежних классов компонентов (main до LATER-91) и новые значения токенов. */
export const COLORS = {
  white: '#ffffff',
  black: '#000000',
  red50: '#fef2f2',
  red100: '#ffe2e2',
  red300: '#ffa2a2',
  red500: '#fb2c36',
  red700: '#c10007',
  red800: '#9f0712',
  emerald100: '#d0fae5',
  emerald600: '#009966',
  emerald800: '#006045',
  slate500: '#62748e',
  blue600: '#155dfc',
  /** Полоса дорожки: muted 40 % поверх белого (прежний color-mix) */
  lane: '#fbfbfb',
  /** muted-foreground после LATER-91 (было #737373) */
  muted: '#636363',
  /** ring после LATER-91 — без прозрачности (было #a1a1a1 / 50 %) */
  ring: '#737373',
  /** Прежние цвета аватаров с белыми инициалами ниже 4,5:1 */
  oldAvatars: ['#16a34a', '#d97706', '#0891b2'],
} as const

/** Вспомогательные функции в странице: перевод любого цвета CSS в sRGB. Вызывать перед измерениями (повтор — без вреда). */
function installTools() {
  const w = window as unknown as { __l91?: unknown }
  if (w.__l91) return
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const rgba = (color: string) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: Math.round((a / 255) * 100) / 100 }
  }
  /** Фон под элементом (вокруг него): первый непрозрачный фон у предков. */
  const under = (element: Element) => {
    for (let e: Element | null = element.parentElement; e; e = e.parentElement) {
      const color = rgba(getComputedStyle(e).backgroundColor)
      if (color.a === 1) return color
    }
    return rgba('#fff')
  }
  /** Рамка (кольцо box-shadow с нулевым размытием или outline) у элемента или у предков не дальше depth. */
  const ring = (element: Element, depth: number) => {
    let e: Element | null = element
    for (let level = 0; e && level <= depth; level++, e = e.parentElement) {
      const style = getComputedStyle(e)
      const shadows = style.boxShadow === 'none' ? [] : style.boxShadow.split(/,(?![^(]*\))/)
      for (const shadow of shadows) {
        const match = /^(.*\))\s+0px 0px 0px (\d+(?:\.\d+)?)px$/.exec(shadow.trim())
        if (!match) continue
        const color = rgba(match[1])
        if (color.a > 0 && Number(match[2]) > 0)
          return { color, width: Number(match[2]), level, under: under(e) }
      }
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
        const color = rgba(style.outlineColor)
        if (color.a > 0) return { color, width: parseFloat(style.outlineWidth), level, under: under(e) }
      }
    }
    return null
  }
  w.__l91 = { rgba, under, ring }
}

type Tools = {
  rgba: (color: string) => Rgba
  under: (element: Element) => Rgba
  ring: (element: Element, depth: number) => Ring | null
}
export type Ring = { color: Rgba; width: number; level: number; under: Rgba }

/** Вычисленные цвета элемента: текст, фон, верхняя граница, фон вокруг него (у предков); прозрачность элемента. */
export async function colorsOf(locator: Locator) {
  await locator.page().evaluate(installTools)
  return locator.evaluate((element) => {
    const t = (window as unknown as { __l91: Tools }).__l91
    const style = getComputedStyle(element)
    return {
      text: t.rgba(style.color),
      background: t.rgba(style.backgroundColor),
      border: t.rgba(style.borderTopColor),
      under: t.under(element),
      opacity: Number(style.opacity),
    }
  })
}

/** Цвет токена index.css (`--muted-foreground`, `--ring`, `--canvas`…). */
export async function token(page: Page, name: string) {
  await page.evaluate(installTools)
  return page.evaluate(
    (name) =>
      (window as unknown as { __l91: Tools }).__l91.rgba(
        getComputedStyle(document.documentElement).getPropertyValue(`--${name}`),
      ),
    name,
  )
}

/** Рамка у элемента (или у предков не дальше depth: у полей и редакторов она на обёртке — focus-within). */
export async function ringOf(locator: Locator, depth = 0) {
  await locator.page().evaluate(installTools)
  return locator.evaluate(
    (element, depth) => (window as unknown as { __l91: Tools }).__l91.ring(element, depth),
    depth,
  )
}

/** Рамка у элемента в фокусе (или у его предков) и подпись этого элемента. */
export async function focusedRing(page: Page, depth = 3) {
  await page.evaluate(installTools)
  return page.evaluate((depth) => {
    const active = document.activeElement
    if (!active || active === document.body) return null
    const name = (active.getAttribute('aria-label') ?? active.textContent ?? active.tagName).trim().slice(0, 60)
    return {
      name,
      focusVisible: active.matches(':focus-visible'),
      ring: (window as unknown as { __l91: Tools }).__l91.ring(active, depth),
    }
  }, depth)
}

export const hex = ({ r, g, b }: Rgba) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

function parseHex(value: string): Rgba {
  const n = Number.parseInt(value.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
}

/** Цвет совпадает с ожидаемым (hex) с точностью округления: не больше tolerance на канал. */
export function expectColor(actual: Rgba, expected: string, what: string, tolerance = 2) {
  const want = parseHex(expected)
  const diff = Math.max(Math.abs(actual.r - want.r), Math.abs(actual.g - want.g), Math.abs(actual.b - want.b))
  expect(diff, `${what}: ${hex(actual)} вместо ${expected}`).toBeLessThanOrEqual(tolerance)
}

/** Цвет поверх фона (полупрозрачная обводка, затемнение) — как его видит человек. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => Math.round(a * top.a + b * (1 - top.a))
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

function luminance({ r, g, b }: Rgba) {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Контраст двух непрозрачных цветов по WCAG (1–21). */
export function contrast(a: Rgba | string, b: Rgba | string) {
  const [la, lb] = [a, b].map((c) => luminance(typeof c === 'string' ? parseHex(c) : c))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Серый: каналы равны (вторичный текст, рамка фокуса). */
export const isGrey = ({ r, g, b }: Rgba) => Math.max(r, g, b) - Math.min(r, g, b) <= 2

/** Плитка карточки THEME на доске по названию (role=button «Открыть THEME-N: …») и её фасад. */
export const tile = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^Открыть THEME-\\d+: ${title}$`) })
export const face = (page: Page, title: string) => tile(page, title).locator(':scope > div')

/** Доска «Вид» пространства «Тёмная тема» — отдельной страницей (/boards/ID). */
export async function openThemeBoard(page: Page) {
  await openHome(page)
  await openBoard(page, SPACE, BOARD)
}

/** Открыть карточку щелчком по плитке на доске «Вид»; возвращает окно карточки. */
export async function openCard(page: Page, title: string) {
  await openThemeBoard(page)
  await tile(page, title).click()
  const window = page.getByRole('dialog', { name: title })
  await expect(window).toBeVisible()
  return window
}

/**
 * Метки на элементе (плитка, окно, список меток): цветные плашки с названием — название, цвет плашки, цвет текста.
 * Плашка — span с title и фоном в style (LabelBadge); аватары (role=img) не попадают.
 */
export async function labelsIn(container: Locator) {
  await container.page().evaluate(installTools)
  return container.evaluate((root) => {
    const t = (window as unknown as { __l91: Tools }).__l91
    return [...root.querySelectorAll<HTMLElement>('span[title][style*="background-color"]:not([role="img"])')].map(
      (e) => ({
        name: e.textContent!.trim(),
        background: t.rgba(getComputedStyle(e).backgroundColor),
        text: t.rgba(getComputedStyle(e).color),
      }),
    )
  })
}

/** Аватары-инициалы в контейнере (UserAvatar, role=img): кто, цвет фона, цвет инициалов. */
export async function avatarsIn(container: Locator) {
  await container.page().evaluate(installTools)
  return container.evaluate((root) => {
    const t = (window as unknown as { __l91: Tools }).__l91
    return [...root.querySelectorAll<HTMLElement>('[role="img"][style*="background-color"]')].map((e) => ({
      name: e.getAttribute('aria-label') ?? '',
      initials: e.textContent!.trim(),
      background: t.rgba(getComputedStyle(e).backgroundColor),
      text: t.rgba(getComputedStyle(e).color),
    }))
  })
}
