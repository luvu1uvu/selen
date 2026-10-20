import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP, wheelOver } from './helpers'
import { block, canvas, DUTY, loaded, openSpace, overflowX, PRODUCT, rect, scrollToBoard, WIDE } from './rows'

/**
 * ТК-L55.13 (LATER-55, дополнение PM 19.10; ADR-0019 «Изменения» 20.10 — ширины в ряду сеткой): узкая доска в ряду
 * показана целиком, по своим колонкам, без прокрутки вбок; широкая занимает остаток ряда до правого края и
 * прокручивается вбок внутри своего блока (соседняя доска, панель и дерево на месте, заголовки над своими колонками);
 * доски ряда разной высоты — под короткой фон холста; доска одна в ряду и шире экрана («Продукт») — во всю ширину,
 * прокручивается вбок внутри себя, полоса прокрутки вбок — у низа окна. Окно ноутбука 1440×900, дерево открыто.
 * «Разработка» демо-данных → RACC «Приёмка рядов» (E2eSeeder), Анна → e2e-admin.
 *
 * Провал LATER-79: на 1440 px сетка ряда делит место поровну (по 542 px), а «Дежурствам» нужно 578 px — вторая
 * колонка обрезана на 36 px. Проверка «узкая целиком» — мягкая (expect.soft): остальные шаги проверяются и при провале.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

/** Сдвиг названия колонки в строке заголовков относительно её ячейки — у всех колонок доски одинаковый. */
function headerOffsets(page: Page, board: string) {
  return page.evaluate((board) => {
    const section = document.querySelector(`section[aria-label="${board}"]`)!
    const header = section.querySelector('[data-board-columns]')!
    return [...section.querySelectorAll('[data-board-body] [role="group"]')].map((cell) => {
      const name = cell.getAttribute('aria-label')!
      const title = [...header.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent === name)!
      return Math.round(title.getBoundingClientRect().left - cell.getBoundingClientRect().left)
    })
  }, board)
}

test('ТК-L55.13. Узкая доска — по своим колонкам, широкая прокручивается вбок внутри блока @tc-L55.13', async ({ page }) => {
  // 1. Открыть пространство, посмотреть на первый ряд
  await openSpace(page, 'RACC', 'Приёмка рядов')
  await loaded(page, DUTY)
  await loaded(page, WIDE)
  const duty = await rect(page, DUTY)
  const wide = await rect(page, WIDE)
  const space = await canvas(page)

  // «Дежурства» — целиком: обе колонки «Сейчас» и «Готово» внутри блока, без прокрутки вбок (LATER-79)
  const dutyBody = block(page, DUTY).locator('[data-board-body]')
  expect.soft(await overflowX(dutyBody), 'LATER-79: «Дежурства» прокручивается вбок — узкая доска обрезана').toBeLessThanOrEqual(1)
  for (const column of ['Сейчас', 'Готово']) {
    const box = (await block(page, DUTY).getByRole('group', { name: column, exact: true }).boundingBox())!
    expect.soft(box.x + box.width, `LATER-79: колонка «${column}» видна целиком`).toBeLessThanOrEqual(duty.right)
  }
  // «Широкая доска» — справа в том же ряду и до правого края холста (с его отступом)
  expect(Math.abs(duty.top - wide.top)).toBeLessThanOrEqual(1)
  expect(Math.round(wide.left - duty.right)).toBe(12)
  expect(space.right - wide.right).toBeLessThanOrEqual(24)

  // 2. Прокрутить «Широкую доску» вбок до конца (тачпадом / Shift+колесом над ней)
  const wideBody = block(page, WIDE).locator('[data-board-body]')
  expect(await overflowX(wideBody)).toBeGreaterThan(1000)
  const title = page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  const fixed = async () => ({
    title: await title.boundingBox(),
    tree: await tree.boundingBox(),
    duty: await rect(page, DUTY),
    dutyScroll: await dutyBody.evaluate((body) => body.scrollLeft),
  })
  const before = await fixed()
  await expect
    .poll(
      async () => {
        await wheelOver(page, wideBody, 1500, 0)
        return wideBody.evaluate((body) => body.scrollWidth - body.clientWidth - body.scrollLeft)
      },
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(1)
  // Едут только колонки «Широкой доски»: «Дежурства», панель и дерево на месте; заголовки — над своими колонками
  expect(await fixed()).toEqual(before)
  const offsets = await headerOffsets(page, WIDE)
  expect(offsets).toHaveLength(14)
  for (const offset of offsets) {
    expect(Math.abs(offset - offsets[0])).toBeLessThanOrEqual(1)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThan(40)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(LAPTOP.width)

  // Доски ряда разной высоты: под более короткой — фон холста, а не белая пустая область
  const now = { duty: await rect(page, DUTY), wide: await rect(page, WIDE) }
  expect(Math.abs(now.duty.height - now.wide.height)).toBeGreaterThan(100)
  const short = now.duty.bottom < now.wide.bottom ? now.duty : now.wide
  const below = await page.evaluate(
    ({ x, y }) => {
      const hit = document.elementFromPoint(x, y)!
      return { inBlock: hit.closest('section[data-board-block]') !== null, row: hit.closest('[data-board-row]') !== null }
    },
    { x: short.left + 40, y: short.bottom + 20 },
  )
  expect(below).toEqual({ inBlock: false, row: true })

  // 3. Прокрутить страницу до «Продукта» (один в ряду) и прокрутить его вбок
  await scrollToBoard(page, PRODUCT, -300)
  await loaded(page, PRODUCT)
  await scrollToBoard(page, PRODUCT, -300)
  const product = await rect(page, PRODUCT)
  // Во всю ширину холста (как первый ряд целиком), прокручивается вбок внутри себя
  expect(Math.abs(product.left - duty.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(product.right - wide.right)).toBeLessThanOrEqual(1)
  const productBody = block(page, PRODUCT).locator('[data-board-body]')
  expect(await overflowX(productBody)).toBeGreaterThan(500)
  await expect
    .poll(
      async () => {
        // Колесо вбок над серединой экрана — внутри «Продукта» (верх доски выше экрана)
        await page.mouse.move(product.left + product.width / 2, LAPTOP.height / 2)
        await page.mouse.wheel(600, 0)
        return productBody.evaluate((body) => body.scrollLeft)
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(300)
  expect((await rect(page, PRODUCT)).left).toBe(product.left)
  // Полоса прокрутки вбок — у низа окна (доска выше экрана)
  expect(product.bottom).toBeGreaterThan(LAPTOP.height)
  const bar = (await block(page, PRODUCT).locator('[data-board-scrollbar]').boundingBox())!
  expect(Math.abs(bar.y + bar.height - LAPTOP.height)).toBeLessThanOrEqual(2)
  expect(await block(page, PRODUCT).locator('[data-board-scrollbar]').evaluate((el) => el.scrollLeft)).toBeGreaterThan(300)
})
