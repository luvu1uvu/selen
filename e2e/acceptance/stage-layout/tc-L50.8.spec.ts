import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { DEV_COLUMNS, expectHeadersAligned, LAPTOP, scrolls, wheelCanvas, wheelOver } from './helpers'

/**
 * ТК-L50.8 (дополнение PM): доску прокрутили вниз и вбок, перешли по ссылке на пространство в шапке доски — оно
 * открывается с самого верха; «Назад» в браузере возвращает доску на то же место по вертикали и вбок, заголовки
 * колонок — над своими колонками. Доска «Продукт» → «Длинная доска», «Разработка» → «Раскладка» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.8. Новая страница — с начала, «Назад» — на прежнее место @tc-L50.8', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')

  // 1. Вниз на несколько экранов и вбок
  await wheelCanvas(page, 1500)
  await wheelOver(page, page.locator('[data-board-columns]'), 500, 0)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(300)
  const saved = await scrolls(page)

  // 2. Ссылка на пространство перед названием доски: страница — с самого верха
  await page.getByRole('region', { name: 'Длинная доска' }).getByRole('link', { name: 'Раскладка', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Раскладка', level: 1 })).toBeVisible()
  expect(await page.getByRole('main').evaluate((main) => main.scrollTop)).toBe(0)
  await expect(page.getByRole('heading', { name: 'Раскладка', level: 1 })).toBeInViewport()

  // 3. «Назад»: доска на том же месте по вертикали и вбок
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Длинная доска' })).toBeVisible()
  await expect.poll(async () => (await scrolls(page)).canvas).toBe(saved.canvas)
  await expect.poll(async () => (await scrolls(page)).body).toBe(saved.body)
  const s = await scrolls(page)
  expect(s.header).toBe(saved.body)
  expect(s.bar).toBe(saved.body)
  await expectHeadersAligned(page, DEV_COLUMNS)
})
