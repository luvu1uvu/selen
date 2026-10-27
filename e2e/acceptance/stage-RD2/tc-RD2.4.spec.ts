import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { LIGHT, chooseTheme, expectShownTheme, resetTheme, themeItem } from './helpers'

/**
 * ТК-RD2.4. «Как в системе» следует за системой на ходу, без перезагрузки. Анна → e2e-admin; тест меняет его тему и в
 * конце возвращает «Светлую». Эмуляция: оформление macOS — prefers-color-scheme браузера (page.emulateMedia); настоящую
 * смену «Системные настройки → Оформление» проверяет PM вручную.
 */
test.use({ storageState: authFile(LIGHT.user) })

test.afterEach(async ({ browser }) => {
  await resetTheme(browser, LIGHT.user, 'light')
})

test('ТК-RD2.4. «Как в системе» следует за системой @tc-RD2.4', async ({ page }) => {
  // Предусловие: система — светлое оформление
  await page.emulateMedia({ colorScheme: 'light' })
  await openHome(page)
  await page.evaluate(() => ((window as unknown as { rd2NoReload: boolean }).rd2NoReload = true))

  // 1. Меню пользователя → «Как в системе»: интерфейс светлый, галочка у «Как в системе»
  await chooseTheme(page, 'system')
  await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'false')
  await expectShownTheme(page, 'light')
  await page.keyboard.press('Escape')

  // 2. Система — тёмное оформление: интерфейс сам стал тёмным
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectShownTheme(page, 'dark')

  // 3. Снова светлое: интерфейс светлый
  await page.emulateMedia({ colorScheme: 'light' })
  await expectShownTheme(page, 'light')
  expect(
    await page.evaluate(() => (window as unknown as { rd2NoReload?: boolean }).rd2NoReload),
    'страница не перезагружалась',
  ).toBe(true)
})
