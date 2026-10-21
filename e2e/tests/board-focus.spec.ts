import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Доска, которая листается вбок (дополнения PM 21.10 к пачке LATER-74). Доска «Процесс» (QA, 8 колонок — шире окна),
 * QA-5 — в колонке Ready for Merge; «Плотная доска» — 4 колонки, уже окна (E2eSeeder).
 * - Tab на частично видимую карточку (UX-ревью LATER-81, U-3): тело доски прокручивается так, что карточка и рамка фокуса
 *   видны целиком; холст и окно вбок не двигаются. Chrome сам прокручивает только полностью скрытый элемент.
 * - Затенение краёв тела (UX-ревью варианта Б, U-7): у края, за которым ещё есть колонки, — тень; докручено до края —
 *   тени нет; у доски уже окна — нет вовсе.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('Tab на карточку у края тела доски — карточка видна целиком', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')
  const card = page.getByRole('button', { name: /^Открыть QA-5:/ })
  // Элемент перед QA-5 в порядке Tab — «+ Карточка» соседней колонки слева
  await page.getByRole('button', { name: 'Добавить карточку в Testing' }).focus()

  // Тело доски — так, чтобы правые 100 px QA-5 были за краем видимой части
  const partial = await card.evaluate((tile) => {
    const body = tile.closest<HTMLElement>('[data-board-body]')!
    const visibleRight = () => body.getBoundingClientRect().left + body.clientWidth
    body.scrollLeft += tile.getBoundingClientRect().right - visibleRight() - 100
    const rect = tile.getBoundingClientRect()
    return { left: rect.left, right: rect.right, visibleRight: visibleRight() }
  })
  expect(partial.left).toBeLessThan(partial.visibleRight)
  expect(partial.right - partial.visibleRight).toBeGreaterThan(90)

  await page.keyboard.press('Tab')
  await expect(card).toBeFocused()
  const after = await card.evaluate((tile) => {
    const body = tile.closest<HTMLElement>('[data-board-body]')!
    const view = body.getBoundingClientRect()
    const rect = tile.getBoundingClientRect()
    return {
      left: rect.left - view.left,
      right: view.left + body.clientWidth - rect.right,
      canvasScrollLeft: document.querySelector('[data-board-canvas]')!.scrollLeft,
      windowScrollX: window.scrollX,
    }
  })
  // Карточка и рамка фокуса (2 px) — целиком в видимой части тела
  expect(after.left).toBeGreaterThanOrEqual(2)
  expect(after.right).toBeGreaterThanOrEqual(2)
  expect(after.canvasScrollLeft).toBe(0)
  expect(after.windowScrollX).toBe(0)
})

/** Видимое затенение у краёв тела доски (и у строки заголовков колонок — те же края). */
async function shades(page: Page, board: string) {
  const block = page.locator(`section[aria-label="${board}"]`)
  return {
    start: await block.locator('[data-board-shade="start"][data-visible]').count(),
    end: await block.locator('[data-board-shade="end"][data-visible]').count(),
  }
}

test('затенение краёв: у доски шире окна — пока есть куда листать; у доски уже окна — нет', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')
  const body = page.locator('[data-board-body]')

  // В начале: справа ещё колонки — тень справа (у тела и строки заголовков), слева — нет
  await expect.poll(() => shades(page, 'Процесс')).toEqual({ start: 0, end: 2 })
  const end = page.locator('[data-board-shade="end"]').last()
  await expect(end).toHaveCSS('opacity', '1')
  const shade = (await end.boundingBox())!
  const view = (await body.boundingBox())!
  expect(Math.abs(shade.x + shade.width - (view.x + view.width))).toBeLessThanOrEqual(1)
  expect(shade.height).toBeGreaterThan(100)

  // Середина — тень с обеих сторон
  await body.evaluate((element) => (element.scrollLeft = 300))
  await expect.poll(() => shades(page, 'Процесс')).toEqual({ start: 2, end: 2 })

  // Докручено до конца — тени справа нет
  await body.evaluate((element) => (element.scrollLeft = element.scrollWidth))
  await expect.poll(() => shades(page, 'Процесс')).toEqual({ start: 2, end: 0 })
  await expect(end).toHaveCSS('opacity', '0')

  // Доска уже окна — затенения нет
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
  await expect(page.locator('section[aria-label="Плотная доска"] [data-board-body]')).toBeVisible()
  expect(await page.locator('[data-board-body]').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await expect.poll(() => shades(page, 'Плотная доска')).toEqual({ start: 0, end: 0 })
})
