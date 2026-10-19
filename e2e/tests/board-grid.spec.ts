import { expect, test, type Locator } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Сетка доски (решение PM 19.10, как в Kaiten): колонки разделены тонкими вертикальными линиями на всю высоту блока,
 * у ячеек своего фона нет; при переносе место, куда упадёт карточка, хорошо видно — ячейка подсвечена, место —
 * пунктирная рамка. «Плотная доска» (E2eSeeder, шаблон «Простой» — 4 колонки): в To Do и In Progress по 8 карточек
 * разной высоты.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
})

/** Линия слева от элемента (псевдоэлемент ::before): толщина, высота и положение относительно элемента. */
function divider(element: Locator) {
  return element.evaluate((el) => {
    const line = getComputedStyle(el, '::before')
    const box = el.getBoundingClientRect()
    return {
      width: line.width,
      height: parseFloat(line.height),
      elementHeight: box.height,
      left: parseFloat(line.left),
      color: line.backgroundColor,
      background: getComputedStyle(el).backgroundColor,
    }
  })
}

test('колонки разделены тонкими линиями от строки заголовков до низа доски; у ячеек нет своего фона', async ({ page }) => {
  const cells = page.locator('[data-board-body] [role="group"]')
  // Шаблон «Простой»: To Do, In Progress, Review, Done
  await expect(cells).toHaveCount(4)

  // У первой колонки линии нет, у остальных — 1 px слева, в середине зазора, на всю высоту ячейки
  expect((await divider(cells.first())).width).toBe('auto')
  for (const index of [1, 2, 3]) {
    const line = await divider(cells.nth(index))
    expect(line.width).toBe('1px')
    expect(line.height).toBeCloseTo(line.elementHeight, 0)
    expect(line.left).toBeCloseTo(-4.5, 1)
    expect(line.color).not.toBe('rgba(0, 0, 0, 0)')
    expect(line.background).toBe('rgba(0, 0, 0, 0)')
  }

  // В строке заголовков — продолжение тех же линий: та же координата x, на всю высоту строки
  const groups = page.locator('[data-board-columns] > div > div')
  for (const index of [1, 2, 3]) {
    const header = await divider(groups.nth(index))
    expect(header.width).toBe('1px')
    expect(header.height).toBeCloseTo(header.elementHeight, 0)
    const headerX = (await groups.nth(index).boundingBox())!.x
    const cellX = (await cells.nth(index).boundingBox())!.x
    expect(Math.abs(headerX - cellX)).toBeLessThanOrEqual(1)
  }

  // Ячейки дорожки тянутся до низа блока — линии доходят до его нижнего края (без отступа под ячейками)
  const block = (await page.locator('section[aria-label="Плотная доска"]').boundingBox())!
  const lastCell = (await cells.nth(3).boundingBox())!
  expect(block.y + block.height - (lastCell.y + lastCell.height)).toBeLessThanOrEqual(20)
})

test('при переносе место броска видно: ячейка-цель подсвечена, место — пунктирная рамка; Esc — карточка на месте', async ({ page }) => {
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  const progress = page.getByRole('group', { name: 'In Progress', exact: true })
  const card = todo.getByRole('button').first()
  const name = await card.getAttribute('aria-label')
  const from = (await card.boundingBox())!
  const to = (await progress.boundingBox())!

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 15; step++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * step) / 15,
      from.y + from.height / 2 + (120 * step) / 15,
    )
  }

  // Место переносимой карточки — в In Progress, с пунктирной рамкой; содержимое места скрыто (видна только рамка)
  const slot = progress.getByRole('button', { name: name! })
  await expect(slot).toHaveCSS('outline-style', 'dashed')
  await expect(slot.locator(':scope > *')).toHaveCSS('visibility', 'hidden')
  // Ячейка-цель подсвечена, соседняя — нет
  const background = (cell: Locator) => cell.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await background(progress)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await background(todo)).toBe('rgba(0, 0, 0, 0)')

  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(todo.getByRole('button', { name: name! })).toBeVisible()
  await expect(todo.getByRole('button', { name: name! })).not.toHaveCSS('outline-style', 'dashed')
})
