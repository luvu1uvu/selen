import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { cardsIn, expectOnTop, LAPTOP, scrolls, wheelCanvas } from './helpers'

/**
 * ТК-L50.6 (LATER-44, без регрессий): на прокрученной доске «+» в заголовке колонки прокручивает доску к началу
 * колонки, поле ввода видно целиком (не под заголовками), карточка встаёт первой; «+ Карточка» под последней
 * карточкой добавляет последнюю. Доска «Продукт» → «Доска переносов» (E2eSeeder), колонка To Do.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.6. «+ Карточка» и «+» в заголовке после прокрутки @tc-L50.6', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Доска переносов')

  // 1. Прокрутить доску вниз на несколько экранов; «+» в заголовке колонки To Do
  await wheelCanvas(page, 2000)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)
  await page.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
  const top = page.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })
  await expect(top).toBeFocused()
  // Доска — у начала колонки, поле видно целиком и не под заголовками
  await expect.poll(async () => (await scrolls(page)).canvas).toBeLessThan(300)
  await expectOnTop(top)
  const field = (await top.boundingBox())!
  const header = (await page.locator('[data-board-columns]').boundingBox())!
  expect(field.y).toBeGreaterThanOrEqual(header.y + header.height)
  expect(field.y + field.height).toBeLessThanOrEqual(LAPTOP.height)

  // 2. «Проверка плюса», Enter, Esc
  await top.fill('Проверка плюса')
  await page.keyboard.press('Enter')
  await expect(cardsIn(page, 'To Do').first()).toHaveAccessibleName(/: Проверка плюса$/)
  await page.keyboard.press('Escape')
  await expect(top).toBeHidden()

  // 3. Прокрутить колонку до конца, навести мышь под последнюю карточку, «+ Карточка»
  const add = page.getByRole('button', { name: 'Добавить карточку в To Do', exact: true })
  await add.scrollIntoViewIfNeeded()
  await add.hover()
  await add.click()
  const bottom = page.getByRole('textbox', { name: 'Добавить карточку в To Do', exact: true })
  await expect(bottom).toBeFocused()
  await expectOnTop(bottom)
  await bottom.fill('Проверка в конце')
  await page.keyboard.press('Enter')
  await expect(cardsIn(page, 'To Do').last()).toHaveAccessibleName(/: Проверка в конце$/)
  await page.keyboard.press('Escape')
  await expect(bottom).toBeHidden()

  // «Проверка плюса» — первая в To Do, «Проверка в конце» — последняя (и после перезагрузки)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Доска переносов' })).toBeVisible()
  await expect(cardsIn(page, 'To Do').first()).toHaveAccessibleName(/: Проверка плюса$/)
  await expect(cardsIn(page, 'To Do').last()).toHaveAccessibleName(/: Проверка в конце$/)
})
