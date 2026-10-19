import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP, laneRow, LANES, openLanesBoard, scrolls, toggle, wheelOver } from './helpers'

/**
 * ТК-L55.8 (LATER-55): на широкой доске название дорожки — у левого края доски, число карточек и стрелка — у правого;
 * при прокрутке доски вбок до конца они не уезжают вместе с колонками. «Продукт» → «Дорожки приёмки» (E2eSeeder,
 * шаблон «Разработка» — шире окна). Прокрутка вбок — колесом (Shift+колесо / тачпад) над доской.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Где на экране название, число карточек и стрелка каждой полосы; видимая часть тела доски. */
function positions(page: Page) {
  return Promise.all(
    LANES.map(async (name) => {
      const row = laneRow(page, name)
      return {
        name: (await row.getByText(name, { exact: true }).boundingBox())!,
        count: (await row.locator('[aria-hidden="true"]').filter({ hasText: /^\d+$/ }).boundingBox())!,
        chevron: (await toggle(page, name, 'Свернуть').boundingBox())!,
      }
    }),
  )
}

test('ТК-L55.8. Название дорожки видно при прокрутке вбок @tc-L55.8', async ({ page }) => {
  await openLanesBoard(page)
  const body = (await page.locator('[data-board-body]').boundingBox())!
  const atStart = await positions(page)
  const column = page.getByRole('group', { name: 'Backlog / Основная', exact: true })
  const columnAtStart = (await column.boundingBox())!

  // 1. Прокрутить доску вбок до конца
  await wheelOver(page, page.getByRole('group', { name: 'To Do / Основная', exact: true }), 20_000, 0)
  await expect.poll(async () => {
    const s = await scrolls(page)
    return s.bodyMax > 200 && s.body >= s.bodyMax - 1
  }).toBe(true)
  const shift = (await scrolls(page)).body
  // Колонки уехали влево на величину прокрутки
  await expect
    .poll(async () => Math.abs(columnAtStart.x - (await column.boundingBox())!.x - shift))
    .toBeLessThanOrEqual(1)

  // 2. Название — у левого края доски, число карточек и стрелка — у правого; на тех же местах, что до прокрутки
  const atEnd = await positions(page)
  for (const [index, row] of atEnd.entries()) {
    expect(row.name.x - body.x).toBeGreaterThanOrEqual(0)
    expect(row.name.x - body.x).toBeLessThan(40)
    const right = body.x + body.width
    expect(right - (row.chevron.x + row.chevron.width)).toBeGreaterThanOrEqual(0)
    expect(right - (row.chevron.x + row.chevron.width)).toBeLessThan(40)
    expect(row.count.x + row.count.width).toBeLessThanOrEqual(row.chevron.x)
    expect(row.chevron.x - row.count.x).toBeLessThan(60)
    for (const part of ['name', 'count', 'chevron'] as const) {
      expect(Math.abs(row[part].x - atStart[index][part].x), `${LANES[index]}: ${part}`).toBeLessThanOrEqual(1)
    }
  }
})
