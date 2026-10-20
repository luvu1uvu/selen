import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Полоса дорожки закреплена и при прокрутке вниз (замечание PM к PR 2, ТК-L55.8): полоса дорожки, ушедшей под заголовки
 * колонок, стоит сразу под ними, пока видна сама дорожка; полоса следующей дорожки её вытесняет (без наложения);
 * в закреплённой полосе стрелка работает, сворачивание оставляет доску на этой дорожке. «Длинные дорожки» (E2eSeeder):
 * шаблон «Разработка» (шире окна), «Основная» и «Срочные» — по 20 карточек в To Do (выше окна), «Плановые» — 2.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const BOARD = 'Длинные дорожки'

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', BOARD)
  await expect(page.locator('[data-lane-row]')).toHaveCount(3)
  const expand = page.getByRole('button', { name: /^Развернуть дорожку/ })
  for (let left = await expand.count(); left > 0; left--) {
    await expand.first().click()
    await expect(expand).toHaveCount(left - 1)
  }
})

const lane = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const band = (page: Page, name: string) => lane(page, name).locator('[data-lane-row]')
const box = async (page: Page, name: string) => (await band(page, name).boundingBox())!

/** Низ закреплённых заголовков колонок — линия, под которой закрепляется полоса. */
const stickyLine = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom)

/** Прокрутить холст так, чтобы верх дорожки оказался на `offset` px ниже линии закрепления (отрицательный — выше). */
async function scrollLaneTo(page: Page, name: string, offset: number) {
  await lane(page, name).evaluate((section, offset) => {
    const canvas = section.closest('[data-board-canvas]')!
    const line = document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom
    canvas.scrollTop += section.getBoundingClientRect().top - line - offset
  }, offset)
}

/** Элемент виден и ничем не перекрыт: в его центре — он сам. */
async function onTop(page: Page, name: string) {
  return band(page, name).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return hit !== null && element.contains(hit)
  })
}

test('полоса длинной дорожки прилипает под заголовками колонок, следующая её вытесняет без наложения', async ({ page }) => {
  // Глубоко внутри «Основной»: её полоса — сразу под заголовками колонок, сверху ничем не закрыта
  await scrollLaneTo(page, 'Основная', -400)
  const line = await stickyLine(page)
  await expect.poll(async () => Math.abs((await box(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)
  expect(await onTop(page, 'Основная')).toBe(true)
  // Заголовки колонок — по-прежнему над полосой
  await expect(page.locator('[data-board-columns]')).toBeInViewport()
  expect(await stickyLine(page)).toBeCloseTo(line, 0)

  // Подходит «Срочные»: её полоса толкает полосу «Основной» вверх — встык, без наложения
  await scrollLaneTo(page, 'Срочные', 15)
  await expect
    .poll(async () => Math.abs((await box(page, 'Основная')).y + 40 - (await box(page, 'Срочные')).y))
    .toBeLessThanOrEqual(1)
  expect((await box(page, 'Основная')).y).toBeLessThan(line)

  // Дальше закреплена «Срочные», полоса «Основной» ушла под заголовки
  await scrollLaneTo(page, 'Срочные', -300)
  await expect.poll(async () => Math.abs((await box(page, 'Срочные')).y - line)).toBeLessThanOrEqual(1)
  const main = await box(page, 'Основная')
  expect(main.y + main.height).toBeLessThanOrEqual(line + 1)
  expect(await onTop(page, 'Срочные')).toBe(true)

  // Обратно вверх — снова закреплена «Основная»
  await scrollLaneTo(page, 'Основная', -400)
  await expect.poll(async () => Math.abs((await box(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)
})

test('закреплённая полоса при прокрутке вбок: название слева, число и стрелка справа', async ({ page }) => {
  await scrollLaneTo(page, 'Основная', -400)
  await page.locator('[data-board-body]').evaluate((body) => (body.scrollLeft = body.scrollWidth))
  await expect
    .poll(() => page.locator('[data-board-body]').evaluate((body) => body.scrollLeft))
    .toBeGreaterThan(200)

  const body = (await page.locator('[data-board-body]').boundingBox())!
  const name = (await band(page, 'Основная').getByText('Основная', { exact: true }).boundingBox())!
  const chevron = (await lane(page, 'Основная').getByRole('button', { name: 'Свернуть дорожку «Основная»' }).boundingBox())!
  expect(name.x - body.x).toBeGreaterThanOrEqual(0)
  expect(name.x - body.x).toBeLessThan(40)
  expect(body.x + body.width - (chevron.x + chevron.width)).toBeGreaterThanOrEqual(0)
  expect(body.x + body.width - (chevron.x + chevron.width)).toBeLessThan(40)
  expect(Math.abs((await box(page, 'Основная')).y - (await stickyLine(page)))).toBeLessThanOrEqual(1)
})

test('свернуть дорожку из закреплённой полосы — доска остаётся на этой дорожке, без прыжка к началу', async ({ page }) => {
  await scrollLaneTo(page, 'Основная', -600)
  const line = await stickyLine(page)
  await expect.poll(async () => Math.abs((await box(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)

  await lane(page, 'Основная').getByRole('button', { name: 'Свернуть дорожку «Основная»' }).click()
  await expect(lane(page, 'Основная').getByRole('button', { name: 'Развернуть дорожку «Основная»' })).toBeVisible()

  // Свёрнутая полоса — там же, под заголовками колонок; сразу под ней — «Срочные»; холст не уехал к началу
  await expect.poll(async () => Math.abs((await box(page, 'Основная')).y - line)).toBeLessThanOrEqual(2)
  expect(Math.abs((await box(page, 'Основная')).y + 40 - (await box(page, 'Срочные')).y)).toBeLessThanOrEqual(1)
  expect(await page.locator('[data-board-canvas]').evaluate((canvas) => canvas.scrollTop)).toBeGreaterThan(0)
  expect(await onTop(page, 'Основная')).toBe(true)
})

test('колесо и тачпад над закреплённой полосой прокручивают доску вниз и вбок', async ({ page }) => {
  await scrollLaneTo(page, 'Основная', -400)
  const line = await stickyLine(page)
  await expect.poll(async () => Math.abs((await box(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)
  const canvas = page.locator('[data-board-canvas]')
  const body = page.locator('[data-board-body]')
  const before = await canvas.evaluate((c) => c.scrollTop)

  // Над серединой полосы (между названием и стрелкой) — колесо вниз прокручивает холст, вбок — тело доски
  const band = await box(page, 'Основная')
  await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => canvas.evaluate((c) => c.scrollTop)).toBeGreaterThan(before + 200)
  await page.mouse.wheel(400, 0)
  await expect.poll(() => body.evaluate((b) => b.scrollLeft)).toBeGreaterThan(300)
})
