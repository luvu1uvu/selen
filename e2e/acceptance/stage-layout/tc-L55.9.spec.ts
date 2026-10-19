import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard } from '../../tests/helpers'
import { LAPTOP, LANES, openLanesBoard, TRANSPARENT } from './helpers'

/**
 * ТК-L55.9 (решение PM 19.10): доска — одна сетка. Между колонками — тонкие вертикальные линии от строки заголовков
 * до низа доски, на полосах дорожек линии прерываются; у ячеек нет серого фона и скруглений, у заголовков колонок —
 * серых плашек. Над подколонками — общий заголовок, линия между подколонками начинается под ним. Слева от первой
 * и справа от последней колонки — такие же отступы, как у названия доски (ТК-L50.14).
 * Доски E2eSeeder: «Продукт» → «Дорожки приёмки» («Раскладка», три дорожки); «Контент» (у In Progress подколонки) →
 * «Дорожки» в «Сквозных тестах» (у In Progress подколонки «Разработка» и «Ревью», две дорожки); «Инфраструктура» →
 * «Плотная доска» (одна дорожка). Насколько линии «тонкие, как в Kaiten» на глаз — только вручную (PM).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Сетка доски: линии ячеек и заголовков колонок, фон и скругления, полосы дорожек, низ блока. */
function grid(page: Page, board: string) {
  return page.evaluate((board) => {
    const line = (el: Element) => {
      const before = getComputedStyle(el, '::before')
      const box = el.getBoundingClientRect()
      return before.content === 'none' || before.width !== '1px'
        ? null
        : {
            x: box.left + parseFloat(before.left),
            top: box.top + (parseFloat(before.top) || 0),
            height: parseFloat(before.height),
            color: before.backgroundColor,
          }
    }
    const plain = (el: Element) => {
      const style = getComputedStyle(el)
      return { background: style.backgroundColor, radius: style.borderRadius }
    }
    const header = document.querySelector('[data-board-columns]')!
    const groups = [...header.querySelectorAll(':scope > div > div')]
    // Цепочка от названия колонки до строки заголовков: ни у одного элемента нет своего фона (серой плашки)
    const titleChains = groups.map((group) => {
      const title = [...group.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent?.trim())!
      const chain = []
      for (let el: Element | null = title; el && el !== header; el = el.parentElement) chain.push(plain(el))
      return { title: title.textContent, chain }
    })
    const cells = [...document.querySelectorAll('[data-board-body] [role="group"]')].map((cell) => {
      const box = cell.getBoundingClientRect()
      return {
        name: cell.getAttribute('aria-label')!,
        left: box.left,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
        line: line(cell),
        ...plain(cell),
      }
    })
    const rows = [...document.querySelectorAll('[data-lane-row]')].map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, background: getComputedStyle(row).backgroundColor }
    })
    const block = document.querySelector(`section[aria-label="${board}"]`)!.getBoundingClientRect()
    return {
      groups: groups.map((group) => {
        const box = group.getBoundingClientRect()
        return { left: box.left, height: box.height, line: line(group), ...plain(group) }
      }),
      titleChains,
      cells,
      rows,
      blockBottom: block.bottom,
    }
  }, board)
}

type Grid = Awaited<ReturnType<typeof grid>>

/** Линии на всю высоту каждой ячейки (кроме первой в ряду) и заголовка; без серого фона и скруглений. */
function expectLines(g: Grid, rowStarts: string[]) {
  for (const cell of g.cells) {
    expect(cell.background, cell.name).toBe(TRANSPARENT)
    expect(cell.radius, cell.name).toBe('0px')
    if (rowStarts.some((start) => cell.name.startsWith(`${start}`))) {
      expect(cell.line, cell.name).toBeNull()
      continue
    }
    expect(cell.line, cell.name).not.toBeNull()
    expect(cell.line!.color, cell.name).not.toBe(TRANSPARENT)
    expect(Math.abs(cell.line!.top - cell.top), cell.name).toBeLessThanOrEqual(1)
    expect(Math.abs(cell.line!.height - cell.height), cell.name).toBeLessThanOrEqual(1)
  }
  for (const [index, group] of g.groups.entries()) {
    expect(group.background).toBe(TRANSPARENT)
    expect(group.radius).toBe('0px')
    if (index === 0) continue
    // Линия заголовка — на всю высоту строки заголовков, продолжение линии ячеек той же колонки
    expect(group.line).not.toBeNull()
    expect(Math.abs(group.line!.height - group.height)).toBeLessThanOrEqual(1)
    const below = g.cells.find((cell) => Math.abs(cell.left - group.left) <= 1)
    expect(below, `ячейка под заголовком ${index}`).toBeDefined()
    expect(Math.abs(below!.line!.x - group.line!.x)).toBeLessThanOrEqual(1)
  }
  for (const { title, chain } of g.titleChains) {
    for (const el of chain) expect(el, `заголовок ${title}`).toEqual({ background: TRANSPARENT, radius: '0px' })
  }
}

/** Полосы дорожек — со своим фоном, линии колонок через них не идут: ни одна ячейка (с линией) не заходит на полосу. */
function expectLinesBrokenOnRows(g: Grid) {
  for (const row of g.rows) {
    expect(row.background).not.toBe(TRANSPARENT)
    for (const cell of g.cells) {
      const overlaps = cell.top < row.bottom - 1 && cell.bottom > row.top + 1
      expect(overlaps, `${cell.name} заходит на полосу дорожки`).toBe(false)
    }
  }
}

test('ТК-L55.9. Колонки разделены тонкими линиями, как в Kaiten @tc-L55.9', async ({ page }) => {
  // 1. Доска с дорожками: линии от строки заголовков до низа доски, на полосах прерываются
  await openLanesBoard(page)
  let g = await grid(page, 'Дорожки приёмки')
  expect(g.cells).toHaveLength(8 * LANES.length)
  expect(g.rows).toHaveLength(LANES.length)
  expectLines(g, ['Backlog /'])
  expectLinesBrokenOnRows(g)
  // Последняя дорожка — до низа блока: линии доходят до низа доски
  expect(g.blockBottom - Math.max(...g.cells.map((c) => c.bottom))).toBeLessThanOrEqual(20)

  // 2. Подколонки: общий заголовок «In Progress» над «Разработка» и «Ревью», линия между ними — под ним
  await openBoard(page, 'Сквозные тесты', 'Дорожки')
  await expect(page.getByRole('heading', { name: 'Дорожки', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ревью / Основная', exact: true })).toBeVisible()
  g = await grid(page, 'Дорожки')
  expectLines(g, ['To Do /'])
  expectLinesBrokenOnRows(g)
  const sub = await page.evaluate(() => {
    const header = document.querySelector('[data-board-columns]')!
    const leaf = (text: string) =>
      [...header.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent === text)!
    const group = leaf('In Progress').closest('[data-board-columns] > div > div')!
    const wrappers = [...group.querySelectorAll(':scope > div:nth-child(2) > div')]
    const before = getComputedStyle(wrappers[1], '::before')
    const box = (e: Element) => e.getBoundingClientRect()
    return {
      children: wrappers.map((w) => w.textContent),
      group: { left: box(group).left, right: box(group).right },
      title: { bottom: box(leaf('In Progress')).bottom, left: box(leaf('In Progress')).left },
      first: { left: box(wrappers[0]).left },
      second: { right: box(wrappers[1]).right, left: box(wrappers[1]).left },
      line: {
        width: before.width,
        top: box(wrappers[1]).top + parseFloat(before.top),
        x: box(wrappers[1]).left + parseFloat(before.left),
      },
    }
  })
  expect(sub.children).toHaveLength(2)
  expect(sub.children[0]).toContain('Разработка')
  expect(sub.children[1]).toContain('Ревью')
  // «In Progress» — над обеими подколонками
  expect(sub.title.left).toBeLessThan(sub.second.left)
  expect(Math.abs(sub.group.left - sub.first.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(sub.group.right - sub.second.right)).toBeLessThanOrEqual(1)
  // Линия между «Разработка» и «Ревью» начинается под заголовком «In Progress»
  expect(sub.line.width).toBe('1px')
  expect(sub.line.top).toBeGreaterThanOrEqual(sub.title.bottom)
  const review = g.cells.find((c) => c.name === 'Ревью / Основная')!
  expect(Math.abs(review.line!.x - sub.line.x)).toBeLessThanOrEqual(1)

  // 3. Одна дорожка: отступы слева от первой и справа от последней колонки — как у названия доски
  await page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: 'Плотная доска', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Плотная доска', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'To Do', exact: true })).toBeVisible()
  g = await grid(page, 'Плотная доска')
  expectLines(g, ['To Do'])
  const paddings = await page.evaluate(async () => {
    const block = document.querySelector('section[aria-label="Плотная доска"]')!
    const edge = block.getBoundingClientRect()
    const title = block.querySelector('header')!.firstElementChild!.getBoundingClientRect()
    const body = document.querySelector('[data-board-body]')!
    const cells = () =>
      [...document.querySelectorAll('[data-board-body] [role="group"]')].map((c) => c.getBoundingClientRect())
    body.scrollLeft = 0
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const first = cells()[0].left - edge.left
    body.scrollLeft = body.scrollWidth
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const all = cells()
    return { title: title.left - edge.left, first, last: edge.right - all[all.length - 1].right }
  })
  expect(paddings.title).toBeGreaterThan(4)
  expect(Math.abs(paddings.first - paddings.title)).toBeLessThanOrEqual(1)
  expect(Math.abs(paddings.last - paddings.title)).toBeLessThanOrEqual(1)
})
