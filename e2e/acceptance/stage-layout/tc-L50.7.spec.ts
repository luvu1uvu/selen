import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { LAPTOP, scrolls, wheelCanvas } from './helpers'

/**
 * ТК-L50.7: на прокрученной доске открыть видимую карточку — окно поверх доски, доска под ним не мигает и не прыгает
 * к началу; после закрытия (крестиком) видны те же карточки. Доска «Продукт» → «Длинная доска» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Карточки, видимые в окне (ниже закреплённых заголовков колонок). */
function visibleCards(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('[data-board-columns]')!.getBoundingClientRect()
    return [...document.querySelectorAll('[role="group"] [aria-label^="Открыть "]')]
      .filter((card) => {
        const box = card.getBoundingClientRect()
        return box.top >= header.bottom && box.bottom <= window.innerHeight && box.width > 0
      })
      .map((card) => card.getAttribute('aria-label'))
  })
}

test('ТК-L50.7. Окно карточки и возврат на то же место @tc-L50.7', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')

  // 1. Прокрутить вниз на несколько экранов, открыть видимую карточку
  await wheelCanvas(page, 1800)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)
  const before = await visibleCards(page)
  const position = await scrolls(page)
  expect(before.length).toBeGreaterThan(2)

  // Доска под окном не пропадает ни на миг (не «мигает»), пока карточка открывается
  await page.evaluate(() => {
    const w = window as unknown as { boardLost: boolean }
    w.boardLost = false
    const check = () => {
      if (!document.querySelector('[data-board-body]')) w.boardLost = true
    }
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true })
  })
  await page.getByRole('button', { name: before[1]!, exact: true }).click()
  await expect(page).toHaveURL(/\/cards\/LAYOUT-\d+$/)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue(/Карточка длинной доски/)
  expect(await page.evaluate(() => (window as unknown as { boardLost: boolean }).boardLost)).toBe(false)
  expect((await scrolls(page)).canvas).toBe(position.canvas)

  // 2. Закрыть крестиком: те же карточки на том же месте
  await dialog.getByRole('button', { name: 'Закрыть' }).first().click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/boards\//)
  expect((await scrolls(page)).canvas).toBe(position.canvas)
  expect(await visibleCards(page)).toEqual(before)
  expect(await page.evaluate(() => (window as unknown as { boardLost: boolean }).boardLost)).toBe(false)
})
