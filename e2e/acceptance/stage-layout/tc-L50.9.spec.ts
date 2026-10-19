import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { DEV_COLUMNS, expectHeadersAligned, LAPTOP, scrolls, wheelOver } from './helpers'

/**
 * ТК-L50.9 (дополнение PM): жест вбок (тачпад — горизонтальное колесо, мышь — Shift+колесо) над строкой
 * заголовков колонок и над полосой прокрутки внизу окна сдвигает доску и заголовки вместе; жест вверх-вниз над
 * заголовками прокручивает доску вверх-вниз, как над карточками. Доска «Продукт» → «Длинная доска» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.9. Прокрутка вбок тачпадом над заголовками колонок @tc-L50.9', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  const header = page.locator('[data-board-columns]')
  const bar = page.locator('[data-board-scrollbar]')

  // 1. Над заголовками — двумя пальцами вбок…
  await wheelOver(page, header, 300, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThanOrEqual(300)
  let s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  expect(s.canvas).toBe(0)
  await expectHeadersAligned(page, DEV_COLUMNS)

  // …и колесом мыши с Shift
  let before = s.body
  await page.keyboard.down('Shift')
  await wheelOver(page, header, 0, 200)
  await page.keyboard.up('Shift')
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(before)
  s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.canvas).toBe(0)

  // 2. То же над полосой прокрутки внизу окна — обратно влево
  before = s.body
  await wheelOver(page, bar, -200, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeLessThan(before)
  s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  await expectHeadersAligned(page, DEV_COLUMNS)
  before = s.body
  await page.keyboard.down('Shift')
  await wheelOver(page, bar, 0, 200)
  await page.keyboard.up('Shift')
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(before)
  s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.canvas).toBe(0)

  // 3. Над заголовками — вверх-вниз: доска прокручивается вверх-вниз, вбок не сдвигается
  const sideways = s.body
  await wheelOver(page, header, 0, 600)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThanOrEqual(600)
  await wheelOver(page, header, 0, -300)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeLessThanOrEqual(300)
  s = await scrolls(page)
  expect(s.canvas).toBeGreaterThan(0)
  expect(s.body).toBe(sideways)
  expect(s.header).toBe(sideways)
  expect(s.window).toEqual([0, 0])
})
