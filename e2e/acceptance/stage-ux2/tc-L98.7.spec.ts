import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, openCardByKey, UXB_BOARD, WINDOW_CARD } from './helpers'

/**
 * ТК-L98.7 (U-10): окно, открытое по прямой ссылке, после Esc закрывается на доску карточки, рамка фокуса — на плитке
 * карточки, доска прокручена к ней. Анна → e2e-editor, DEV-41 → UXB-1 «Как DEV-41» в колонке Done доски «Продукт»
 * пространства UXB (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.7. Окно по прямой ссылке — после закрытия фокус на плитке @tc-L98.7', async ({ page }) => {
  // 1. Адрес карточки — прямо в адресной строке
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)

  // 2. Esc — окно закрылось, открыта доска «Продукт», рамка фокуса — на плитке карточки
  await page.keyboard.press('Escape')
  await expect(window).toHaveCount(0)
  await expect(page.getByRole('heading', { name: UXB_BOARD, exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/\/cards\//)
  const tile = page.getByRole('button', { name: `Открыть ${WINDOW_CARD.key}: ${WINDOW_CARD.title}` })
  await expect(tile).toBeFocused()
  expect(await tile.evaluate((e) => e.matches(':focus-visible')), 'рамка фокуса видна').toBe(true)

  // Доска прокручена к плитке — она на экране целиком
  const box = (await tile.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
})
