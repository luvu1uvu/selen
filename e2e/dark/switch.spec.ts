import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome } from '../tests/helpers'

/**
 * Переключатель темы в меню пользователя (решения PM 21.10, LATER-89, пп. 6–8; ADR-0025): выбор сохраняется на сервере и
 * в браузере — держится после перезагрузки и приходит на «новое устройство»; «Как в системе» следует за системной темой
 * без перезагрузки. Тест меняет тему e2e-dark и в конце возвращает «Тёмную» (её ждут остальные тесты проекта).
 */
test.use({ storageState: authFile('e2e-dark@selen.test') })

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

async function choose(page: Page, theme: 'Светлая' | 'Тёмная' | 'Как в системе') {
  const item = page.getByRole('menuitemradio', { name: theme })
  if (!(await item.isVisible())) await page.getByRole('button', { name: 'Меню пользователя' }).click()
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/v1/profile/theme') && r.ok())
  await item.click()
  await saved
  // Меню после выбора не закрывается, отметка — у выбранной
  await expect(item).toHaveAttribute('aria-checked', 'true')
}

test.afterEach(async ({ page }) => {
  await page.keyboard.press('Escape')
  await choose(page, 'Тёмная')
})

test('выбор держится после перезагрузки и на новом устройстве; «Как в системе» — за системой', async ({ page, browser }) => {
  await openHome(page)
  expect(await isDark(page)).toBe(true)

  // «Светлая» — сразу и после перезагрузки
  await choose(page, 'Светлая')
  expect(await isDark(page)).toBe(false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  expect(await isDark(page)).toBe(false)

  // «Как в системе» — следует за системной темой на ходу
  await page.emulateMedia({ colorScheme: 'light' })
  await choose(page, 'Как в системе')
  expect(await isDark(page)).toBe(false)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => isDark(page)).toBe(true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => isDark(page)).toBe(false)
  await page.keyboard.press('Escape')

  // «Новое устройство»: та же сессия, копии в браузере нет — выбор приходит с сервера и становится копией
  const { cookies } = await page.context().storageState()
  const other = await browser.newContext({ colorScheme: 'dark', storageState: { cookies, origins: [] } })
  const device = await other.newPage()
  await openHome(device)
  await expect.poll(() => isDark(device)).toBe(true)
  expect(await device.evaluate(() => localStorage.getItem('selen.theme'))).toBe('system')
  await other.close()
})
