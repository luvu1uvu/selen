import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { cardsIn, expectNoCrash, LAPTOP, scrolls } from './helpers'

/**
 * ТК-L50.5 (ADR-0007): перенос с клавиатуры из низа длинной колонки — пробел, стрелка вправо, пробел. После первой
 * же стрелки карточка показана в соседней колонке на той же высоте; после пробела остаётся там (и после
 * перезагрузки); экран не уезжает к началу доски. Доска «Продукт» → «Доска переносов» (E2eSeeder): Backlog и To Do
 * по 30 карточек. «Нажимать Tab, пока на карточке не появится рамка фокуса» — фокус на ней.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.5. Перенос карточки с клавиатуры @tc-L50.5', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Доска переносов')

  // 1. Прокрутить колонку до последней карточки, фокус на ней
  const last = cardsIn(page, 'Backlog').last()
  const name = (await last.getAttribute('aria-label'))!
  const card = page.getByRole('group', { name: 'Backlog', exact: true }).getByRole('button', { name, exact: true })
  await card.scrollIntoViewIfNeeded()
  await card.focus()
  await expect(card).toBeFocused()
  const canvas = (await scrolls(page)).canvas
  expect(canvas).toBeGreaterThan(500)
  const top = (await card.boundingBox())!.y

  // 2. Пробел, стрелка вправо, пробел. Что происходит — как слышит пользователь скринридера
  const announced = (text: RegExp) => expect(page.getByText(text)).toBeAttached()
  await page.keyboard.press('Space')
  await announced(/над ячейкой «Backlog»/)
  // dnd-kit начинает слушать стрелки через setTimeout после взятия карточки: без паузы стрелку успевает обработать
  // браузер (прокрутка тела на 40 px), как не бывает у человека
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await announced(/над ячейкой «To Do»/)

  // После первой же стрелки — в соседней колонке на той же высоте, экран на месте
  const target = page.getByRole('group', { name: 'To Do', exact: true }).getByRole('button', { name, exact: true })
  await expect(target).toBeInViewport()
  expect(Math.abs((await target.boundingBox())!.y - top)).toBeLessThan(40)
  expect(Math.abs((await scrolls(page)).canvas - canvas)).toBeLessThan(100)

  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.keyboard.press('Space')
  expect((await moved).status()).toBe(200)
  await announced(/перемещена в «To Do»/)
  await expectNoCrash(page)
  await expect(target).toHaveCount(1)
  await expect(target).toBeInViewport()
  const s = await scrolls(page)
  expect(Math.abs(s.canvas - canvas)).toBeLessThan(100)
  expect(s.window).toEqual([0, 0])

  // После перезагрузки — там же
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Доска переносов' })).toBeVisible()
  await expect(target).toHaveCount(1)
})
