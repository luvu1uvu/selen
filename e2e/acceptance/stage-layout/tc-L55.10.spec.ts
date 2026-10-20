import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { cell, cellBackgrounds, center, glide, LAPTOP, LANES_BOARD, openLanesBoard, slotOf, TRANSPARENT } from './helpers'

/**
 * ТК-L55.10 (условие PM к сетке колонок): без серых ячеек всё равно видно, куда упадёт карточка — колонка-цель
 * подсвечена, место карточки — пунктирная рамка её размера, рамка двигается за указателем; отпущенная карточка встаёт
 * на место рамки и остаётся там после обновления страницы. «Продукт» → «Дорожки приёмки» (E2eSeeder): карточка
 * Backlog — «Приёмочная плановая» (дорожка «Плановые»), её проводим над To Do и отпускаем над In Progress этой же
 * дорожки. Насколько подсветка «хорошо видна» на глаз — только вручную (PM).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L55.10. Место броска при переносе хорошо видно @tc-L55.10', async ({ page }) => {
  await openLanesBoard(page)
  const backlog = cell(page, 'Backlog / Плановые')
  const todo = cell(page, 'To Do / Плановые')
  const progress = cell(page, 'In Progress / Плановые')
  const card = backlog.getByRole('button', { name: /: Приёмочная плановая$/ })
  await card.scrollIntoViewIfNeeded()
  const name = (await card.getAttribute('aria-label'))!
  const size = (await card.boundingBox())!

  // Пока ничего не переносят — ячейки без фона
  for (const [label, background] of Object.entries(await cellBackgrounds(page))) {
    expect(background, label).toBe(TRANSPARENT)
  }

  // 1. Взять карточку из Backlog и, не отпуская, поводить над To Do и In Progress
  const from = center(size)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const overTodo = { x: center((await todo.boundingBox())!).x, y: from.y + 10 }
  await glide(page, from, overTodo)

  /** Место карточки — одно, в ячейке `where`, с пунктирной рамкой размера карточки; подсвечена только эта ячейка. */
  const expectDropAt = async (where: string) => {
    await expect.poll(async () => (await slotOf(page, name)).map((s) => s.cell)).toEqual([where])
    const [slot] = await slotOf(page, name)
    expect(slot.dashed).toBe(true)
    expect(Math.abs(slot.width - size.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(slot.height - size.height)).toBeLessThanOrEqual(1)
    const backgrounds = await cellBackgrounds(page)
    expect(backgrounds[where]).not.toBe(TRANSPARENT)
    for (const [label, background] of Object.entries(backgrounds)) {
      if (label !== where) expect(background, label).toBe(TRANSPARENT)
    }
    return slot
  }

  const atTodo = await expectDropAt('To Do / Плановые')
  // Пунктирная рамка видна человеку: внутри неё содержимое карточки скрыто, рамка — в ячейке под указателем
  await expect(todo.getByRole('button', { name, exact: true })).toHaveCSS('outline-style', 'dashed')
  const progressBox = (await progress.boundingBox())!
  const overProgress = { x: center(progressBox).x, y: overTodo.y }
  await glide(page, overTodo, overProgress)
  const atProgress = await expectDropAt('In Progress / Плановые')
  // Рамка переехала вслед за указателем — из To Do в In Progress
  expect(atProgress.x - atTodo.x).toBeGreaterThan(200)
  expect(atProgress.x).toBeGreaterThanOrEqual(progressBox.x)
  expect(atProgress.x + atProgress.width).toBeLessThanOrEqual(progressBox.x + progressBox.width)

  // 2. Отпустить над In Progress — карточка встаёт на место рамки
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  expect((await moved).status()).toBe(200)
  const placed = progress.getByRole('button', { name, exact: true })
  await expect(placed).toBeVisible()
  await expect(placed).not.toHaveCSS('outline-style', 'dashed')
  const box = (await placed.boundingBox())!
  expect(Math.abs(box.x - atProgress.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(box.y - atProgress.y)).toBeLessThanOrEqual(1)
  await expect(backlog.getByRole('button', { name, exact: true })).toHaveCount(0)
  for (const [label, background] of Object.entries(await cellBackgrounds(page))) {
    expect(background, label).toBe(TRANSPARENT)
  }

  // …и остаётся там после обновления страницы
  await page.reload()
  await expect(page.getByRole('heading', { name: LANES_BOARD })).toBeVisible()
  await expect(cell(page, 'In Progress / Плановые').getByRole('button', { name, exact: true })).toBeVisible()
  await expect(cell(page, 'Backlog / Плановые').getByRole('button', { name, exact: true })).toHaveCount(0)
})
