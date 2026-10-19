import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DEV_COLUMNS, expandAllLanes, LAPTOP, LANES, LANES_BOARD, openLanesBoard, toggle } from './helpers'

/**
 * ТК-L55.7: сворачивание — только вид: числа в заголовках колонок считают и карточки свёрнутых дорожек — после
 * сворачивания всех дорожек и обновления страницы они те же. «Продукт» → «Дорожки приёмки» (E2eSeeder): Backlog — 1
 * (в «Плановых»), To Do — 5 («Основная» и «Срочные»), In Progress — 1 («Срочные»).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Числа в заголовках колонок по порядку колонок шаблона «Разработка». */
function columnCounts(page: Page) {
  return page.locator('[data-board-columns]').getByTitle(/карт\./).allTextContents()
}

test('ТК-L55.7. Счётчики колонок не меняются @tc-L55.7', async ({ page }) => {
  await openLanesBoard(page)

  // 1. Запомнить числа в заголовках колонок
  await expect(page.locator('[data-board-columns]').getByTitle(/карт\./)).toHaveCount(DEV_COLUMNS.length)
  const before = await columnCounts(page)
  // Backlog, To Do, In Progress — карточки E2eSeeder (ТК-L55.10 переносит карточку «Плановых» из Backlog в In Progress)
  expect(Number(before[0]) + Number(before[2])).toBe(2)
  expect(before[1]).toBe('5')

  // 2. Свернуть все дорожки, обновить страницу — числа те же
  for (const name of LANES) await toggle(page, name, 'Свернуть').click()
  await expect(page.locator('[data-board-body] [role="group"]')).toHaveCount(0)
  expect(await columnCounts(page)).toEqual(before)
  await page.reload()
  await expect(page.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Развернуть дорожку/ })).toHaveCount(LANES.length)
  await expect(page.locator('[data-board-body] [role="group"]')).toHaveCount(0)
  await expect.poll(() => columnCounts(page)).toEqual(before)

  // 3. Развернуть все дорожки
  await expandAllLanes(page)
  await expect.poll(() => columnCounts(page)).toEqual(before)
})
