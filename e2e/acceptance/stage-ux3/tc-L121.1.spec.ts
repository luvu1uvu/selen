import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { BOARD, SPACE, WIDE } from './helpers'

/**
 * ТК-L121.1 (U-4 «Редизайна»): у краёв широкой доски, за которыми ещё есть колонки, заголовки колонок и карточки
 * растворяются, а полоса дорожки — нет: название, число карточек и стрелка у краёв такие же, как без растворения, и в
 * потоке, и в закреплённой полосе. Анна → e2e-editor, «Разработка» / «Продукт» → UXC «Пачка UX-3» / «Продукт» (шаблон
 * «Разработка» — шире окна; в «Основной» 26 карточек — выше окна, E2eSeeder::uxBatch3; тест только смотрит).
 *
 * Скрипт сравнивает снимки краёв полосы под растворением и без него (у этого края) — попиксельно; что растворение
 * мягкое и выглядит «как раньше» — только вручную.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: WIDE })

const LANE = 'Основная'
const band = (page: Page) => page.getByRole('region', { name: LANE, exact: true }).locator('[data-lane-row]')
const body = (page: Page) => page.locator('[data-board-body]')

type Side = 'start' | 'end'
type Shown = Record<Side, boolean>

/** Видно ли растворение края: прозрачность всех его частей (у заголовков колонок и у тела доски). */
const shadeOpacity = (page: Page, side: Side) =>
  page.evaluate(
    (side) => [...document.querySelectorAll(`[data-board-shade="${side}"]`)].map((e) => getComputedStyle(e).opacity),
    side,
  )

/** Прокрутить доску вбок (как тачпадом) и дождаться, пока растворение краёв примет нужный вид (у него переход). */
async function scrollBodyTo(page: Page, where: 'start' | 'middle' | 'end', shown: Shown) {
  await body(page).evaluate((element, where) => {
    const max = element.scrollWidth - element.clientWidth
    element.scrollLeft = where === 'start' ? 0 : where === 'end' ? max : Math.round(max / 2)
  }, where)
  for (const side of ['start', 'end'] as const) {
    await expect
      .poll(() => shadeOpacity(page, side), `${where}: растворение у ${side === 'start' ? 'левого' : 'правого'} края`)
      .toEqual([shown[side] ? '1' : '0', shown[side] ? '1' : '0'])
  }
}

/** Растворение края лежит на заголовках колонок и на карточках: его части стоят у края и закрывают их по высоте. */
const shadeCovers = (page: Page, side: Side) =>
  page.evaluate((side) => {
    const edge = document.querySelector('[data-board-body]')!.getBoundingClientRect()
    const headers = document.querySelector('[data-board-columns]')!.getBoundingClientRect()
    const card = document.querySelector('[data-lane-row]')!.getBoundingClientRect().bottom + 40
    const shades = [...document.querySelectorAll(`[data-board-shade="${side}"]`)]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => (side === 'start' ? Math.abs(r.left - edge.left) : Math.abs(r.right - edge.right)) <= 1)
    const covers = (y: number) => shades.some((r) => r.top <= y && r.bottom >= y && r.width > 0)
    return { headers: covers(headers.top + headers.height / 2), cards: covers(card) }
  }, side)

/**
 * Снимки краёв полосы дорожки в видимой части доски: слева — начало названия, справа — число карточек и стрелка.
 * Указатель — в сторону: наведение меняет вид.
 */
async function bandEdges(page: Page) {
  await page.mouse.move(0, 0)
  const row = (await band(page).boundingBox())!
  const visible = (await body(page).boundingBox())!
  const clip = (x: number, width: number) => ({ x: Math.round(x), y: Math.round(row.y) + 2, width, height: 36 })
  return {
    left: await page.screenshot({ clip: clip(visible.x, 48) }),
    right: await page.screenshot({ clip: clip(visible.x + visible.width - 80, 80) }),
  }
}

/** Шаги 2–4 тест-кейса: края полосы под растворением — такие же, как без него. */
async function expectBandEdgesSharp(page: Page, state: string) {
  // 2. В начале: справа растворение (дальше есть колонки), слева нет
  await scrollBodyTo(page, 'start', { start: false, end: true })
  const atStart = await bandEdges(page)
  // В конце: слева растворение, справа нет — образец правого края без растворения
  await scrollBodyTo(page, 'end', { start: true, end: false })
  const atEnd = await bandEdges(page)
  expect(atStart.right.equals(atEnd.right), `${state}, в начале: число и стрелка под растворением — как без него`).toBe(
    true,
  )
  expect(atEnd.left.equals(atStart.left), `${state}, в конце: начало названия под растворением — как без него`).toBe(true)

  // 3–4. Посередине растворение у обоих краёв — заголовки колонок и карточки под ним, полоса — такая же, как без него
  await scrollBodyTo(page, 'middle', { start: true, end: true })
  for (const side of ['start', 'end'] as const) {
    expect(await shadeCovers(page, side), `${state}, посередине: растворение у края (${side})`).toEqual({
      headers: true,
      cards: true,
    })
  }
  const middle = await bandEdges(page)
  expect(middle.left.equals(atStart.left), `${state}, посередине: первая буква «${LANE}» не бледнеет`).toBe(true)
  expect(middle.right.equals(atEnd.right), `${state}, посередине: число и стрелка не бледнеют`).toBe(true)
}

test('ТК-L121.1. Широкая доска: название дорожки и стрелка у краёв не бледнеют @tc-L121.1', async ({ page }) => {
  // 1. Дерево → «Пачка UX-3» → «Продукт»: доска шире окна
  await openHome(page)
  await openSpaceBoard(page, SPACE, BOARD)
  await expect(band(page)).toBeVisible()
  await expect(band(page)).toContainText(LANE)
  expect(await body(page).evaluate((e) => e.scrollWidth > e.clientWidth + 200), 'доска шире окна').toBe(true)

  // 2–4. Полоса «Основная» в потоке
  await expectBandEdgesSharp(page, 'в потоке')

  // 5. Холст вниз: полоса «Основная» закреплена под заголовками колонок; снова шаги 3–4
  await page.getByRole('region', { name: LANE, exact: true }).evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    const line = document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom
    canvas.scrollTop += section.getBoundingClientRect().top - line + 400
  })
  const line = () =>
    page.evaluate(() => document.querySelector('[data-board-columns]')!.parentElement!.getBoundingClientRect().bottom)
  await expect
    .poll(async () => Math.abs((await band(page).boundingBox())!.y - (await line())), 'полоса закреплена под заголовками')
    .toBeLessThanOrEqual(1)
  await expectBandEdgesSharp(page, 'закреплена')
})
