import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { expandAllLanes, LAPTOP, lane, laneRow, scrolls, toggle } from './helpers'

/**
 * ТК-L55.8 (LATER-55, дополнение PM 20.10): полоса дорожки закреплена и при прокрутке вниз, и вбок. Длинная дорожка —
 * её полоса прилипает сразу под заголовками колонок и видна, пока видна сама дорожка; полоса следующей дорожки её
 * вытесняет, без наложения двух полос; вбок название и «⋯» — слева, число карточек и стрелка — справа; в закреплённой
 * полосе работают «⋯» и стрелка, а свёрнутая из неё дорожка не уводит доску к началу. «Продукт» → «Длинные дорожки
 * приёмки» (E2eSeeder): шаблон «Разработка» (шире окна), «Основная» и «Срочные» — по 20 карточек в To Do (выше окна).
 * Вход — администратор пространства: у полосы есть «⋯».
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const BOARD = 'Длинные дорожки приёмки'

const bandBox = async (page: Page, name: string) => (await laneRow(page, name).boundingBox())!

/** Низ закреплённых заголовков колонок — под ним закрепляется полоса. */
const stickyLine = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom)

/** Прокрутить холст колесом над карточками, пока верх дорожки не окажется на `offset` px от линии закрепления. */
async function scrollUntil(page: Page, name: string, offset: number) {
  const target = await lane(page, name).evaluate((section, offset) => {
    const line = document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom
    return section.getBoundingClientRect().top - line - offset
  }, offset)
  await page.locator('[data-board-canvas]').evaluate((canvas, dy) => canvas.scrollBy(0, dy), target)
}

/** Полоса видна и ничем не перекрыта: в её центре — она сама. */
const onTop = (page: Page, name: string) =>
  laneRow(page, name).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return hit !== null && element.contains(hit)
  })

test('ТК-L55.8. Полоса дорожки закреплена при прокрутке вниз и вбок @tc-L55.8', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', BOARD)
  await expandAllLanes(page)

  // 1. Прокрутить вниз на несколько экранов по «Основной»: её полоса — сразу под заголовками колонок, поверх карточек.
  //    Линию мерим после прокрутки: заголовки закрепляются у верха холста, выше своего места до прокрутки
  await scrollUntil(page, 'Основная', -700)
  const line = await stickyLine(page)
  await expect.poll(async () => Math.abs((await bandBox(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)
  expect(await onTop(page, 'Основная')).toBe(true)
  await expect(page.locator('[data-board-columns]')).toBeInViewport()

  // 2. Вбок до конца и обратно: название и «⋯» — у левого края доски, число и стрелка — у правого; полоса на месте
  // Колесо вбок — над карточками под закреплённой полосой
  const over = page.locator('[data-board-canvas]')
  const canvasBox = (await over.boundingBox())!
  const point = { x: canvasBox.x + canvasBox.width / 2, y: line + 150 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(20_000, 0)
  await expect.poll(async () => {
    const s = await scrolls(page)
    return s.bodyMax > 200 && s.body >= s.bodyMax - 1
  }).toBe(true)
  const body = (await page.locator('[data-board-body]').boundingBox())!
  const row = laneRow(page, 'Основная')
  const name = (await row.getByText('Основная', { exact: true }).boundingBox())!
  const menu = (await row.getByRole('button', { name: 'Действия с дорожкой «Основная»' }).boundingBox())!
  const chevron = (await toggle(page, 'Основная', 'Свернуть').boundingBox())!
  const count = (await row.locator('[aria-hidden="true"]').filter({ hasText: /^\d+$/ }).boundingBox())!
  expect(name.x - body.x).toBeGreaterThanOrEqual(0)
  expect(name.x - body.x).toBeLessThan(40)
  expect(menu.x).toBeGreaterThan(name.x)
  expect(menu.x - body.x).toBeLessThan(200)
  expect(body.x + body.width - (chevron.x + chevron.width)).toBeGreaterThanOrEqual(0)
  expect(body.x + body.width - (chevron.x + chevron.width)).toBeLessThan(40)
  expect(count.x + count.width).toBeLessThanOrEqual(chevron.x)
  expect(Math.abs((await bandBox(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(-20_000, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBe(0)

  // 3. До «Срочных»: их полоса вытесняет полосу «Основной» вверх — встык, без наложения; дальше закреплена «Срочные»;
  //    вверх — снова «Основная»
  await scrollUntil(page, 'Срочные', 15)
  await expect
    .poll(async () => Math.abs((await bandBox(page, 'Основная')).y + 40 - (await bandBox(page, 'Срочные')).y))
    .toBeLessThanOrEqual(1)
  expect((await bandBox(page, 'Основная')).y).toBeLessThan(line)
  await scrollUntil(page, 'Срочные', -400)
  await expect.poll(async () => Math.abs((await bandBox(page, 'Срочные')).y - line)).toBeLessThanOrEqual(1)
  const main = await bandBox(page, 'Основная')
  expect(main.y + main.height).toBeLessThanOrEqual(line + 1)
  expect(await onTop(page, 'Срочные')).toBe(true)
  await scrollUntil(page, 'Основная', -700)
  await expect.poll(async () => Math.abs((await bandBox(page, 'Основная')).y - line)).toBeLessThanOrEqual(1)

  // 4. «⋯» на закреплённой полосе — меню дорожки открывается; Esc — закрывается
  await row.getByRole('button', { name: 'Действия с дорожкой «Основная»' }).click()
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()

  // 5. Стрелка на закреплённой полосе — «Основная» свернулась: её полоса там же под заголовками, под ней — «Срочные»,
  //    доска не прыгнула к началу; развернули — карточки «Основной» снова под её полосой
  await toggle(page, 'Основная', 'Свернуть').click()
  await expect(toggle(page, 'Основная', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => Math.abs((await bandBox(page, 'Основная')).y - line)).toBeLessThanOrEqual(2)
  expect(Math.abs((await bandBox(page, 'Основная')).y + 40 - (await bandBox(page, 'Срочные')).y)).toBeLessThanOrEqual(1)
  expect(await page.locator('[data-board-canvas]').evaluate((canvas) => canvas.scrollTop)).toBeGreaterThan(0)
  await toggle(page, 'Основная', 'Развернуть').click()
  await expect(page.getByRole('group', { name: 'To Do / Основная', exact: true })).toBeVisible()
  const below = (await page.getByRole('group', { name: 'To Do / Основная', exact: true }).boundingBox())!
  expect(Math.abs(below.y - ((await bandBox(page, 'Основная')).y + 40))).toBeLessThanOrEqual(1)
})
