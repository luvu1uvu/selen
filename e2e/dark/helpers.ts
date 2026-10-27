import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Фон страницы тёмной темы — токен `background` набора `.dark` (frontend/src/index.css), #19191c. */
export const DARK_BACKGROUND = 'rgb(25, 25, 28)'

/** Пространство и доска тёмных тестов (E2eSeeder::darkTheme). */
export const SPACE = 'Тёмная проверка'
export const BOARD = 'Вид'

/** На <html> — тёмная тема: класс `dark`, `color-scheme: dark`, тёмный фон страницы. */
export async function expectDarkTheme(page: Page) {
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  await expect(page.locator('body')).toHaveCSS('background-color', DARK_BACKGROUND)
}

/** Контраст текста по WCAG 2 AA — правило axe-core `color-contrast` на всём, что сейчас на экране. */
export async function expectReadable(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const problems = violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(' ')} — ${node.failureSummary ?? ''}`),
  )
  expect(problems, `${what}: текст ниже нормы контраста`).toEqual([])
}

/**
 * Светлые пятна: видимый элемент от 12×12 px с непрозрачным светлым фоном (относительная яркость больше 0,35 — светлее
 * #a0a0a0). Не пятна: цвета, которые выбрал пользователь (метки, типы, аватары — фон в `style`), картинки и видео. Главная
 * кнопка тёмной темы — светлый акцент #8b8cf8 (решение PM 21.10, п. 5) — 0,31, ниже порога.
 */
export async function expectNoLightSpots(page: Page, what: string) {
  const spots = await page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    /** Любой цвет CSS (rgb, oklch, …) → sRGB 0–255 и прозрачность 0–1. */
    const rgba = (color: string) => {
      canvas.clearRect(0, 0, 1, 1)
      canvas.fillStyle = '#000'
      canvas.fillStyle = color
      canvas.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const channel = (value: number) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const found: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (['IMG', 'VIDEO', 'CANVAS', 'svg', 'path'].includes(element.tagName)) continue
      if (element.style.backgroundColor || element.style.background) continue
      const rect = element.getBoundingClientRect()
      if (rect.width < 12 || rect.height < 12) continue
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const { r, g, b, a } = rgba(getComputedStyle(element).backgroundColor)
      if (a < 0.5) continue
      const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      if (luminance > 0.35) {
        const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? ''
        found.push(`${element.tagName.toLowerCase()}.${element.className} «${name}» rgb(${r}, ${g}, ${b})`)
      }
    }
    return found
  })
  expect(spots, `${what}: светлые пятна`).toEqual([])
}

/**
 * Экран в тёмной теме: тёмный фон, ни одного светлого пятна, весь текст читается. Меряем, когда закончились анимации
 * (появление меню и окна — с прозрачности): посреди них цвета полупрозрачные.
 */
export async function expectDarkScreen(page: Page, what: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
  await expectDarkTheme(page)
  await expectNoLightSpots(page, what)
  await expectReadable(page, what)
}
