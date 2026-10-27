import { expect, test } from '@playwright/test'
import { authFile } from '../tests/helpers'
import { DARK_BACKGROUND } from './helpers'

/**
 * Тема до первой отрисовки (ADR-0025): /theme-init.js — отдельный файл (не встроенный скрипт: CSP `script-src 'self'`,
 * LATER-86), подключён в <head> раньше стилей и кода приложения, ставит тему по копии в браузере. Код приложения здесь не
 * загружается вовсе — тёмной страницу делает только он и стили: вспышки светлой темы нет.
 */
test.use({ storageState: authFile('e2e-dark@selen.test') })

test('сохранённая «Тёмная» — тёмная с первой отрисовки, до кода приложения', async ({ page }) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname)
  })
  await page.route('**/assets/*.js', (route) => route.abort())

  await page.goto('/', { waitUntil: 'load' })

  expect(scripts[0], 'первый скрипт страницы').toBe('/theme-init.js')
  // Раньше стилей: тема уже на <html>, когда браузер применяет стили
  expect(
    await page.evaluate(() => {
      const head = [...document.head.children]
      const init = head.findIndex((e) => e.getAttribute('src') === '/theme-init.js')
      const styles = head.findIndex((e) => e.getAttribute('rel') === 'stylesheet')
      return init >= 0 && styles > init && !document.querySelector('script:not([src])')
    }),
    'theme-init.js — отдельным файлом до стилей, встроенных скриптов нет',
  ).toBe(true)
  await expect(page.locator('#root'), 'код приложения не загружен').toBeEmpty()
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  await expect(page.locator('body')).toHaveCSS('background-color', DARK_BACKGROUND)
})

test('сохранённая «Светлая» — светлая, без класса dark', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    colorScheme: 'dark',
    storageState: { cookies: [], origins: [{ origin: baseURL!, localStorage: [{ name: 'selen.theme', value: 'light' }] }] },
  })
  const page = await context.newPage()
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.goto('/login', { waitUntil: 'load' })
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await context.close()
})
