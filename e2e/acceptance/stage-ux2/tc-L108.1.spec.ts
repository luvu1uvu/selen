import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'

/**
 * ТК-L108.1 (LATER-108): на экране уже 768 px выезжающее меню ведёт себя как окно — Tab ходит только внутри, Esc
 * закрывает меню и затемнение, рамка фокуса — на «Открыть меню». Анна → e2e-editor; окно 700 px.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: { width: 700, height: 800 } })

test('ТК-L108.1. Меню на узком экране закрывается Esc @tc-L108.1', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()

  // 1. «Открыть меню» — слева выезжает меню, страница затемнена
  const open = page.getByRole('button', { name: 'Открыть меню' })
  await open.click()
  const menu = page.getByRole('dialog', { name: 'Меню' })
  await expect(menu.getByRole('navigation', { name: 'Дерево' })).toBeVisible()
  const box = (await menu.boundingBox())!
  expect(box.x, 'меню — у левого края').toBeLessThanOrEqual(1)
  await expect(page.locator('[data-slot="sheet-overlay"]')).toBeVisible()

  // 2. Tab несколько раз — фокус только внутри меню
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab')
    expect(await menu.evaluate((e) => e.contains(document.activeElement)), `Tab ${i + 1}: фокус в меню`).toBe(true)
  }

  // 3. Esc — меню и затемнение пропали, рамка фокуса на «Открыть меню»
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0)
  await expect(open).toBeFocused()
  expect(await open.evaluate((e) => e.matches(':focus-visible')), 'рамка фокуса видна').toBe(true)
})
