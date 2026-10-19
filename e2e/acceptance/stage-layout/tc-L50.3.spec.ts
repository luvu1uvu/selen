import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { DEV_COLUMNS, expectHeadersAligned, expectOnTop, LAPTOP, scrolls, wheelCanvas, wheelOver } from './helpers'

/**
 * ТК-L50.3 (LATER-4): полоса прокрутки вбок у широкой длинной доски — у нижнего края окна, а не под самой длинной
 * колонкой; прокрутка вбок этой полосой (сверху и с середины доски) сдвигает заголовки вместе с колонками; дерево
 * и верхняя полоса на месте. Доска «Продукт» → «Длинная доска» (E2eSeeder): 8 колонок шире окна ноутбука.
 * Прокрутка полосой — жестом тачпада над ней (горизонтальное колесо).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.3. Полоса прокрутки вбок — внизу окна @tc-L50.3', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  const bar = page.locator('[data-board-scrollbar]')
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  const treeBox = (await tree.boundingBox())!

  // 1. Ничего не прокручивая: полоса — у нижнего края окна; доска шире окна
  const barAtBottom = async () => {
    const box = (await bar.boundingBox())!
    expect(Math.abs(box.y + box.height - LAPTOP.height)).toBeLessThanOrEqual(1)
  }
  await barAtBottom()
  const start = await scrolls(page)
  expect(start.bodyMax).toBeGreaterThan(300)
  expect(start.canvasMax).toBeGreaterThan(1000)

  // 2. Прокрутить вбок полосой внизу окна
  await wheelOver(page, bar, 400, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThanOrEqual(300)
  let s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  expect(s.canvas).toBe(0)
  await expectHeadersAligned(page, DEV_COLUMNS)
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  expect(await tree.boundingBox()).toEqual(treeBox)

  // 3. С середины доски — снова вбок той же полосой (она по-прежнему внизу окна)
  await wheelCanvas(page, start.canvasMax / 2)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(start.canvasMax / 3)
  await barAtBottom()
  const before = (await scrolls(page)).body
  await wheelOver(page, bar, 10_000, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(before)
  s = await scrolls(page)
  expect(s.body).toBe(s.bodyMax)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  await expectHeadersAligned(page, DEV_COLUMNS)
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  expect(await tree.boundingBox()).toEqual(treeBox)
  expect(s.window).toEqual([0, 0])
  expect(s.pageWidth).toBe(LAPTOP.width)
})
