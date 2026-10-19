import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { scrolls } from './helpers'

/**
 * ТК-L50.12 (поправка PM 19.10 к LATER-50): на широком экране узкая доска — блок на фоне холста: фон холста
 * отличается от фона доски, у доски граница; доска заканчивается сразу после последней колонки (справа — фон холста),
 * под последними карточками — тоже фон холста; шапка «Пространство / Доска» с «⋯» — внутри блока доски.
 * «Инфраструктура» (4 колонки) → «Плотная доска» пространства «Сквозные тесты» (E2eSeeder, 4 колонки).
 * Насколько фон холста «заметно темнее» и как выглядят скругления — только вручную (PM).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: { width: 1920, height: 1080 } })

/** Что рядом с блоком доски: справа от последней колонки и под блоком — холст, а не доска. */
function aroundBlock(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const block = document.querySelector('section[aria-label="Плотная доска"]')!
    const canvas = document.querySelector('[data-board-canvas]')!
    const box = block.getBoundingClientRect()
    const cells = [...block.querySelectorAll('[role="group"]')].map((c) => c.getBoundingClientRect())
    const lastRight = Math.max(...cells.map((c) => c.right))
    const isCanvas = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return hit !== null && canvas.contains(hit) && block !== hit && !block.contains(hit)
    }
    const style = getComputedStyle(block)
    return {
      blockRight: box.right,
      blockBottom: box.bottom,
      lastColumnRight: lastRight,
      canvasRight: canvas.getBoundingClientRect().right,
      canvasBottom: canvas.getBoundingClientRect().bottom,
      rightIsCanvas: isCanvas(box.right + 40, Math.max(box.top, 0) + 200),
      belowIsCanvas: box.bottom < canvas.getBoundingClientRect().bottom - 8 && isCanvas(box.left + 60, box.bottom + 6),
      canvasBackground: getComputedStyle(canvas).backgroundColor,
      blockBackground: style.backgroundColor,
      border: style.borderTopWidth !== '0px' && style.borderTopStyle !== 'none',
      lastCardBottom: Math.max(...[...block.querySelectorAll('[aria-label^="Открыть "]')].map((c) => c.getBoundingClientRect().bottom)),
    }
  })
}

test('ТК-L50.12. Узкая доска — блок на фоне холста @tc-L50.12', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
  const block = page.getByRole('region', { name: 'Плотная доска' })

  // Шапка «Сквозные тесты / Плотная доска» с «⋯» — внутри блока доски
  await expect(block.getByRole('link', { name: 'Сквозные тесты', exact: true })).toBeVisible()
  await expect(block.getByRole('heading', { name: 'Плотная доска' })).toBeVisible()
  await expect(block.getByRole('button', { name: 'Действия с доской' })).toBeVisible()

  // Фон холста — свой, у доски — граница; справа от последней колонки (Done) — холст
  let m = await aroundBlock(page)
  expect(m.canvasBackground).not.toBe(m.blockBackground)
  expect(m.border).toBe(true)
  expect(m.blockRight - m.lastColumnRight).toBeLessThanOrEqual(24)
  expect(m.blockRight).toBeLessThan(m.canvasRight - 200)
  expect(m.rightIsCanvas).toBe(true)
  await expect(page.getByRole('group', { name: 'Done', exact: true })).toBeInViewport()

  // Прокрутить вниз до конца: под последними карточками доска заканчивается, ниже — холст
  const canvas = page.locator('[data-board-canvas]')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + box.width - 100, box.y + box.height / 2)
  await page.mouse.wheel(0, 10_000)
  await expect.poll(async () => {
    const s = await scrolls(page)
    return s.canvasMax - s.canvas
  }).toBeLessThanOrEqual(1)
  m = await aroundBlock(page)
  expect(m.belowIsCanvas).toBe(true)
  expect(m.blockBottom).toBeGreaterThan(m.lastCardBottom)
  expect(m.blockBottom - m.lastCardBottom).toBeLessThan(120)
})
