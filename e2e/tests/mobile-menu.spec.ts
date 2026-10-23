import { expect, test } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Меню на экране уже 768 px (LATER-108): полоса разделов и панель — выезжающее слева окно (Sheet): пока оно открыто,
 * фокус внутри; Esc закрывает его вместе с затемнением, фокус — снова на «Открыть меню».
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: { width: 700, height: 800 } })

test('Esc закрывает меню и затемнение, фокус — на «Открыть меню» (LATER-108)', async ({ page }) => {
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Открыть меню' })
  await open.click()

  const menu = page.getByRole('dialog', { name: 'Меню' })
  await expect(menu.getByRole('navigation', { name: 'Дерево' })).toBeVisible()
  await expect.poll(() => menu.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  // Tab не уходит под затемнение
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  expect(await menu.evaluate((element) => element.contains(document.activeElement))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0)
  await expect(open).toBeFocused()

  // Переход из меню закрывает его
  await open.click()
  await menu.getByRole('link', { name: /Сквозные тесты/ }).click()
  await expect(page.getByRole('heading', { name: 'Сквозные тесты' })).toBeVisible()
  await expect(menu).toHaveCount(0)
})
