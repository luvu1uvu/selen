import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { expectHeadersAligned, expectOnTop, LAPTOP, scrolls, wheelOver } from './helpers'

/**
 * ТК-L50.13 (поправка PM 19.10 к LATER-50): доска шире экрана занимает всю ширину холста (с небольшим отступом),
 * страница вбок не прокручивается; доска без карточек невысокая — под ней фон холста, полоса прокрутки вбок —
 * сразу под доской; при прокрутке вбок до конца заголовки едут вместе с колонками, шапка доски на месте.
 * «Широкая доска» (14 колонок, без карточек) — такая же в пространстве «Раскладка» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

const COLUMNS = [
  'Backlog',
  'To Do',
  'In Progress',
  'Code Review',
  'Ready for Testing',
  'Testing',
  'Ready for Merge',
  'Аналитика',
  'Дизайн',
  'Ревью дизайна',
  'Документация',
  'Подготовка релиза',
  'Мониторинг',
  'Done',
]

test('ТК-L50.13. Широкая доска — во всю ширину, прокрутка внутри блока @tc-L50.13', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Широкая доска')
  const block = page.getByRole('region', { name: 'Широкая доска' })
  const canvas = page.locator('[data-board-canvas]')
  const bar = page.locator('[data-board-scrollbar]')
  await expect(block.getByRole('group')).toHaveCount(14)

  // Во всю ширину холста (небольшой отступ справа), страница вбок не прокручивается, тело доски — прокручивается
  const blockBox = (await block.boundingBox())!
  const canvasBox = (await canvas.boundingBox())!
  const margin = canvasBox.x + canvasBox.width - (blockBox.x + blockBox.width)
  expect(margin).toBeGreaterThanOrEqual(0)
  expect(margin).toBeLessThanOrEqual(24)
  let s = await scrolls(page)
  expect(s.pageWidth).toBe(LAPTOP.width)
  expect(s.bodyMax).toBeGreaterThan(1000)

  // Невысокая: под доской — фон холста; полоса прокрутки вбок — сразу под доской (внутри блока, у его низа)
  expect(blockBox.y + blockBox.height).toBeLessThan(LAPTOP.height / 2)
  const below = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      const canvasElement = document.querySelector('[data-board-canvas]')!
      return hit !== null && canvasElement.contains(hit) && hit.closest('section') === null
    },
    { x: blockBox.x + 60, y: blockBox.y + blockBox.height + 40 },
  )
  expect(below).toBe(true)
  const barBox = (await bar.boundingBox())!
  expect(blockBox.y + blockBox.height - (barBox.y + barBox.height)).toBeGreaterThanOrEqual(0)
  expect(blockBox.y + blockBox.height - (barBox.y + barBox.height)).toBeLessThanOrEqual(4)

  // Прокрутить вбок до конца (жест тачпада над доской): заголовки едут вместе с колонками, шапка на месте
  const heading = block.getByRole('heading', { name: 'Широкая доска' })
  const headingBox = await heading.boundingBox()
  await wheelOver(page, page.getByRole('group', { name: 'Backlog', exact: true }), 20_000, 0)
  await expect.poll(async () => {
    const now = await scrolls(page)
    return now.bodyMax - now.body
  }).toBeLessThanOrEqual(1)
  s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  expect(s.pageWidth).toBe(LAPTOP.width)
  expect(s.window).toEqual([0, 0])
  await expectHeadersAligned(page, COLUMNS)
  await expect(page.getByRole('group', { name: 'Done', exact: true })).toBeInViewport()
  expect(await heading.boundingBox()).toEqual(headingBox)
  await expectOnTop(block.getByRole('link', { name: 'Раскладка', exact: true }))
  await expectOnTop(block.getByRole('button', { name: 'Действия с доской' }))
})
