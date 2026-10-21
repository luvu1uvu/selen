import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Доска, которая листается вбок (дополнения PM 21.10 к пачке LATER-74). Доска «Процесс» (QA, 8 колонок — шире окна),
 * QA-5 — в колонке Ready for Merge (E2eSeeder).
 * - Tab на частично видимую карточку (UX-ревью LATER-81, U-3): тело доски прокручивается так, что карточка и рамка фокуса
 *   видны целиком; холст и окно вбок не двигаются. Chrome сам прокручивает только полностью скрытый элемент.
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
